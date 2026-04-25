/**
 * Discussion Room Route — Multi-turn free-form discussion
 *
 * POST /api/discussion-room
 *
 * STREAMING: Server-Sent Events   data: <JSON>\n\n
 *
 * Two modes:
 *   mode: 'intro'   — teacher gives opening intro speech, then steps back.
 *                     Phase in the classroom: teacher presents topic, leaves.
 *   mode: 'turn'    — user sent a message; assistant + student agents respond.
 *                     Teacher is absent (stepped back).
 *
 * Event shapes:
 *   { type: 'agent_start',    agentId, agentName, agentRole }
 *   { type: 'agent_response', agentId, agentName, agentRole, speech, whiteboardActions }
 *   { type: 'cue_user',       fromAgentId: string | null }  — turn complete, awaiting student (mode:turn)
 *   { type: 'error',          message }
 *   { type: 'done' }
 *
 * Body:
 * {
 *   classroomId:  string
 *   topic:        string         — e.g. "the ethics of AI"
 *   prompt?:      string         — optional extra context / project brief
 *   mode:         'intro' | 'turn'
 *   history?:     { role:'user'|'agent', agentName?:string, content:string }[]
 *   userMessage?: string         — the student's latest message (mode:turn only)
 *   userProfile?: { nickname?, bio? }
 * }
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

interface AgentConfig {
  id: string;
  name: string;
  role: string;
  persona?: string;
}

export interface DiscussionTurnMessage {
  role: 'user' | 'agent';
  agentName?: string;
  content: string;
}

const WB_ACTION_NAMES = new Set<string>([
  'wb_open', 'wb_close', 'wb_clear', 'wb_delete',
  'wb_draw_text', 'wb_draw_shape', 'wb_draw_chart',
  'wb_draw_latex', 'wb_draw_table', 'wb_draw_line',
]);

// ── Route ─────────────────────────────────────────────────────────────────────

router.post('/', protect, async (req, res): Promise<void> => {
  const {
    classroomId,
    topic,
    prompt,
    mode,
    history = [],
    userMessage,
    userProfile,
    sceneImage,
  } = req.body as {
    classroomId: string;
    topic: string;
    prompt?: string;
    mode: 'intro' | 'turn';
    history?: DiscussionTurnMessage[];
    userMessage?: string;
    userProfile?: { nickname?: string; bio?: string };
    sceneImage?: { imageUrl: string; caption?: string; imagePrompt?: string };
  };

  if (!classroomId || !topic?.trim() || !mode) {
    res.status(400).json({ error: 'classroomId, topic, and mode are required' });
    return;
  }
  if (mode === 'turn' && !userMessage?.trim()) {
    res.status(400).json({ error: 'userMessage is required for mode:turn' });
    return;
  }

  const classroom = await Classroom.findById(classroomId).lean().catch(() => null);
  if (!classroom) {
    res.status(404).json({ error: 'Classroom not found' });
    return;
  }

  const agents = (classroom.agentConfigs ?? []) as AgentConfig[];
  if (agents.length === 0) {
    res.status(400).json({ error: 'Classroom has no agents configured' });
    return;
  }

  // Open SSE stream
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
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

    // ── Shared action processor (used in both modes) ────────────────────────
    function processActions(raw: string) {
      const actions = parseActionsFromStructuredOutput(raw.trim());
      const speechParts: string[] = [];
      const whiteboardActions: Array<{ name: string; params?: Record<string, unknown> }> = [];
      for (const action of actions) {
        if (action.type === 'speech') {
          const text = ((action as Record<string, unknown>).text as string | undefined)?.trim();
          if (text) speechParts.push(text);
        } else if (WB_ACTION_NAMES.has(action.type)) {
          const params = { ...action } as Record<string, unknown>;
          delete params.id; delete params.type;
          whiteboardActions.push({ name: action.type, params });
        }
      }
      return { speechParts, whiteboardActions };
    }

    if (mode === 'intro') {
      // ── room-intro: teacher gives opening, then steps back ──────────────────
      const teacher = directorAgents.find((a) => a.role === 'teacher') ?? directorAgents[0];

      const engine = new DirectorEngine(
        {
          agents:         directorAgents,
          topic,
          mode:           'room-intro',
          triggerAgentId: teacher.id,
          userProfile,
          initialWbLedger: [],
        },
        callAI,
      );

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const decision = engine.decide();
        if (decision.action !== 'speak') break;

        const agent = directorAgents.find((a) => a.id === decision.agentId);
        if (!agent) break;

        send({ type: 'agent_start', agentId: agent.id, agentName: agent.name, agentRole: agent.role });

        const promptInput: DiscussionPromptInput = {
          agentId:          agent.id,
          agentName:        agent.name,
          agentRole:        agent.role,
          agentPersona:     agent.persona ?? '',
          discussionTopic:  topic,
          discussionPrompt: prompt,
          isInitiating:     true,
          agentTurnSummaries: engine.getAgentResponses(),
          wbLedger:           engine.getWbLedger(),
          userProfile,
          sceneImage,
          allowedWbActions:   decision.allowedWbActions,
        };

        try {
          const raw = await callAI(
            buildDiscussionSystemPrompt(promptInput),
            buildDiscussionUserPrompt(promptInput),
          );
          const { speechParts, whiteboardActions } = processActions(raw);
          const speech = speechParts.join(' ').trim() || '…';

          engine.recordTurn(
            { agentId: agent.id, agentName: agent.name, contentPreview: speech.slice(0, 130), wbActionCount: whiteboardActions.length },
            whiteboardActions,
          );
          send({ type: 'agent_response', agentId: agent.id, agentName: agent.name, agentRole: agent.role, speech, whiteboardActions });
        } catch (err) {
          console.error('[discussion-room intro] teacher failed:', err);
          engine.recordTurn(
            { agentId: agent.id, agentName: agent.name, contentPreview: '', wbActionCount: 0 },
            [],
          );
          send({ type: 'error', message: 'Teacher intro failed' });
        }
      }
    } else {
      // ── room-turn: assistant + student respond; teacher stepped back ──────
      const engine = new DirectorEngine(
        {
          agents:          directorAgents,
          topic,
          mode:            'room-turn',
          userProfile,
          initialWbLedger: [],
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

        const agent = directorAgents.find((a) => a.id === decision.agentId);
        if (!agent) break;

        send({ type: 'agent_start', agentId: agent.id, agentName: agent.name, agentRole: agent.role });

        const promptInput: DiscussionPromptInput = {
          agentId:            agent.id,
          agentName:          agent.name,
          agentRole:          agent.role,
          agentPersona:       agent.persona ?? '',
          discussionTopic:    topic,
          discussionPrompt:   prompt,
          studentMessage:     userMessage,
          isInitiating:       engine.getAgentResponses().length === 0,
          agentTurnSummaries: engine.getAgentResponses(),
          wbLedger:           engine.getWbLedger(),
          conversationHistory: history,
          userProfile,
          sceneImage,
          allowedWbActions:   decision.allowedWbActions,
        };

        try {
          const raw = await callAI(
            buildDiscussionSystemPrompt(promptInput),
            buildDiscussionUserPrompt(promptInput),
          );
          const { speechParts, whiteboardActions } = processActions(raw);
          const speech = speechParts.join(' ').trim();

          if (!speech && whiteboardActions.length === 0) {
            engine.recordTurn(
              { agentId: agent.id, agentName: agent.name, contentPreview: '', wbActionCount: 0 },
              [],
            );
            continue;
          }

          const finalSpeech = speech || '…';
          engine.recordTurn(
            { agentId: agent.id, agentName: agent.name, contentPreview: finalSpeech.slice(0, 130), wbActionCount: whiteboardActions.length },
            whiteboardActions,
          );
          send({
            type: 'agent_response',
            agentId: agent.id, agentName: agent.name, agentRole: agent.role,
            speech: finalSpeech, whiteboardActions,
          });
          anySucceeded = true;
        } catch (agentErr) {
          console.error(`[discussion-room turn] ${agent.name} failed:`, agentErr);
          engine.recordTurn(
            { agentId: agent.id, agentName: agent.name, contentPreview: '', wbActionCount: 0 },
            [],
          );
        }
      }

      if (!anySucceeded) {
        send({ type: 'error', message: 'Agents failed to respond' });
      }
    }
  } catch (err) {
    console.error('[discussion-room] Fatal error:', err);
    send({ type: 'error', message: 'Discussion room failed' });
  } finally {
    send({ type: 'done' });
    res.end();
  }
});

export const discussionRoomRouter = router;
