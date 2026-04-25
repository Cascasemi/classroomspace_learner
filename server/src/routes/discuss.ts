/**
 * Discussion Route — Live agent responses during classroom discussion breaks
 *
 * POST /api/discuss
 *
 * STREAMING: Responses arrive as Server-Sent Events (text/event-stream).
 * Each line: `data: <JSON>\n\n`
 *
 * Event shapes:
 *   { type: 'agent_start',    agentId, agentName, agentRole }
 *   { type: 'agent_response', agentId, agentName, agentRole, speech, whiteboardActions }
 *   { type: 'cue_user',       fromAgentId: string | null }  — round complete, awaiting student
 *   { type: 'error',          message }
 *   { type: 'done' }
 *
 * Protocol:
 *  1. Instantiate a DirectorEngine for this request (mode: 'discuss').
 *  2. Loop — call engine.decide() each iteration:
 *     'speak'    → dispatch the named agent:
 *       a. Emit agent_start.
 *       b. Call LLM with system+user prompts that include peer-turn summaries,
 *          whiteboard ledger, and role-gated wb action catalogue.
 *       c. Parse the structured JSON output.
 *       d. Emit agent_response, then call engine.recordTurn().
 *     'cue_user' → emit cue_user event and break.
 *     'end'      → break (unused in this mode but handled defensively).
 *  3. Emit done.
 *
 * Error handling: individual agent failures are skipped silently; if ALL
 * agents fail an error event is emitted before done.
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { Classroom } from '../models/Classroom.js';
import { createAICallFnForUser } from '../ai/llm.js';
import {
  buildDiscussionSystemPrompt,
  buildDiscussionUserPrompt,
  type DiscussionPromptInput,
} from '../orchestration/agent-prompt-builder.js';
import { DirectorEngine, type DirectorAgent } from '../orchestration/director-engine.js';
import { parseActionsFromStructuredOutput } from '../generation/action-parser.js';

const router = Router();

// ==================== Internal Types ====================

interface AgentConfig {
  id: string;
  name: string;
  role: string;
  persona?: string;
}

export interface DiscussionAgentResponse {
  agentId: string;
  agentName: string;
  agentRole: string;
  /** Concatenated text from all type:"text" items — used for TTS */
  speech: string;
  /** All whiteboard actions emitted by this agent — applied to frontend state */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  whiteboardActions: Array<{ name: string; params?: Record<string, any> }>;
}

// ==================== SSE Helpers ====================

const WB_ACTION_NAMES = new Set<string>([
  'wb_open', 'wb_close', 'wb_clear', 'wb_delete',
  'wb_draw_text', 'wb_draw_shape', 'wb_draw_chart',
  'wb_draw_latex', 'wb_draw_table', 'wb_draw_line',
]);

// ==================== Route ====================

/**
 * POST /api/discuss
 *
 * Body:
 * {
 *   classroomId:      string
 *   discussionTopic:  string
 *   discussionPrompt? string
 *   sceneTitle?       string
 *   sceneDescription? string
 *   studentMessage?   string   — from ASR
 *   userProfile?      { nickname?: string; bio?: string }
 * }
 *
 * Response: text/event-stream — one `data:` line per event.
 */
router.post('/', protect, async (req, res): Promise<void> => {
  const {
    classroomId,
    discussionTopic,
    discussionPrompt,
    sceneTitle,
    sceneDescription,
    sceneImage,
    sceneType,
    sceneSectionIds,
    initialWbLedger,
    studentMessage,
    userProfile,
    targetRoles,
  } = req.body as {
    classroomId: string;
    discussionTopic: string;
    discussionPrompt?: string;
    sceneTitle?: string;
    sceneDescription?: string;
    sceneImage?: { imageUrl: string; caption?: string; imagePrompt?: string };
    sceneType?: 'lesson' | 'quiz';
    sceneSectionIds?: string[];
    initialWbLedger?: Array<{ agentName: string; actionName: string; params: Record<string, unknown> }>;
    studentMessage?: string;
    userProfile?: { nickname?: string; bio?: string };
    /**
     * When set, only agents whose role is in this array will participate.
     * Useful for teacher-only follow-up after a student asks a question.
     */
    targetRoles?: string[];
  };

  // ── Validation (before opening SSE stream) ──
  if (!classroomId || !discussionTopic) {
    res.status(400).json({ error: 'classroomId and discussionTopic are required' });
    return;
  }

  const classroom = await Classroom.findById(classroomId).lean().catch(() => null);
  if (!classroom) {
    res.status(404).json({ error: 'Classroom not found' });
    return;
  }

  const allAgents = (classroom.agentConfigs ?? []) as AgentConfig[];
  // Optionally restrict to a subset of roles (e.g. ['teacher'] for a targeted reply)
  const agents = targetRoles && targetRoles.length > 0
    ? allAgents.filter((a) => targetRoles.includes(a.role))
    : allAgents;
  if (agents.length === 0) {
    res.status(400).json({ error: 'Classroom has no agents configured' });
    return;
  }

  // ── Open SSE stream ──
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function send(event: Record<string, any>): void {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  try {
    const callAI = await createAICallFnForUser(req.userId ?? '');

    const directorAgents: DirectorAgent[] = agents.map((a) => ({
      id:      a.id,
      name:    a.name,
      role:    a.role,
      persona: a.persona,
    }));

    const engine = new DirectorEngine(
      {
        agents:      directorAgents,
        topic:       discussionTopic,
        mode:        'discuss',
        userProfile,
        initialWbLedger: initialWbLedger ?? [],
      },
      callAI,
    );

    let anySucceeded = false;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const decision = engine.decide();

      if (decision.action === 'cue_user') {
        send({ type: 'cue_user', fromAgentId: decision.fromAgentId });
        break;
      }
      if (decision.action === 'end') break;

      // decision.action === 'speak'
      const agent = directorAgents.find((a) => a.id === decision.agentId);
      if (!agent) break; // safety

      send({ type: 'agent_start', agentId: agent.id, agentName: agent.name, agentRole: agent.role });

      const promptInput: DiscussionPromptInput = {
        agentId:          agent.id,
        agentName:        agent.name,
        agentRole:        agent.role,
        agentPersona:     agent.persona ?? '',
        discussionTopic,
        discussionPrompt,
        studentMessage,
        sceneTitle,
        sceneDescription,
        sceneImage,
        sceneType,
        sceneSectionIds,
        isInitiating:     engine.getAgentResponses().length === 0,
        agentTurnSummaries: engine.getAgentResponses(),
        wbLedger:           engine.getWbLedger(),
        userProfile,
        allowedWbActions:   decision.allowedWbActions,
      };

      const systemPrompt = buildDiscussionSystemPrompt(promptInput);
      const userPrompt   = buildDiscussionUserPrompt(promptInput);

      try {
        const raw     = await callAI(systemPrompt, userPrompt);
        const actions = parseActionsFromStructuredOutput(raw.trim());

        if (actions.length === 0) {
          // Count as a turn even with empty output so the engine advances.
          engine.recordTurn(
            { agentId: agent.id, agentName: agent.name, contentPreview: '', wbActionCount: 0 },
            [],
          );
          continue;
        }

        const speechParts: string[] = [];
        const whiteboardActions: DiscussionAgentResponse['whiteboardActions'] = [];

        for (const action of actions) {
          if (action.type === 'speech') {
            const text = ((action as Record<string, unknown>).text as string | undefined)?.trim();
            if (text) speechParts.push(text);
          } else if (WB_ACTION_NAMES.has(action.type)) {
            const params = { ...action } as Record<string, unknown>;
            delete params.id;
            delete params.type;
            whiteboardActions.push({ name: action.type, params });
          }
        }

        const speech = speechParts.join(' ').trim();
        if (!speech && whiteboardActions.length === 0) {
          engine.recordTurn(
            { agentId: agent.id, agentName: agent.name, contentPreview: '', wbActionCount: 0 },
            [],
          );
          continue;
        }

        const agentResp: DiscussionAgentResponse = {
          agentId:          agent.id,
          agentName:        agent.name,
          agentRole:        agent.role,
          speech:           speech || '…',
          whiteboardActions,
        };

        engine.recordTurn(
          {
            agentId:        agent.id,
            agentName:      agent.name,
            contentPreview: speech.slice(0, 130),
            wbActionCount:  whiteboardActions.length,
          },
          whiteboardActions,
        );

        send({ type: 'agent_response', ...agentResp });
        anySucceeded = true;
      } catch (agentErr) {
        console.error(`[discuss] Agent ${agent.name} failed:`, agentErr);
        // Record a failed turn so the engine still advances past this agent.
        engine.recordTurn(
          { agentId: agent.id, agentName: agent.name, contentPreview: '', wbActionCount: 0 },
          [],
        );
      }
    }

    if (!anySucceeded) {
      send({ type: 'error', message: 'All agents failed to respond' });
    }
  } catch (err) {
    console.error('[discuss] Fatal error:', err);
    send({ type: 'error', message: 'Discussion generation failed' });
  } finally {
    send({ type: 'done' });
    res.end();
  }
});

export const discussRouter = router;
