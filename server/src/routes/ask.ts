/**
 * Ask Route — Mid-lecture student Q&A
 *
 * POST /api/ask
 *
 * STREAMING: Responses arrive as Server-Sent Events (text/event-stream).
 * Same event format as /api/discuss:
 *   { type: 'agent_start',    agentId, agentName, agentRole }
 *   { type: 'agent_response', agentId, agentName, agentRole, speech, whiteboardActions }
 *   { type: 'error',          message }
 *   { type: 'done' }
 *
 * Behaviour:
 *  – Teacher answers the student's question directly and clearly (primary role)
 *  – Assistant adds one supplementary point or clarification
 *  – Student-agent reacts authentically (short, 1-2 sentences)
 *  After all agents respond, the class continues from where it paused.
 *  Uses DirectorEngine (mode: 'ask') — terminal decision is 'end' (no cue_user).
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

const WB_ACTION_NAMES = new Set<string>([
  'wb_open', 'wb_close', 'wb_clear', 'wb_delete',
  'wb_draw_text', 'wb_draw_shape', 'wb_draw_chart',
  'wb_draw_latex', 'wb_draw_table', 'wb_draw_line',
]);

// ==================== Route ====================

router.post('/', protect, async (req, res): Promise<void> => {
  const {
    classroomId,
    question,
    sceneTitle,
    sceneImage,
    sceneType,
    sceneSectionIds,
    initialWbLedger,
    userProfile,
  } = req.body as {
    classroomId: string;
    question: string;
    sceneTitle?: string;
    sceneImage?: { imageUrl: string; caption?: string; imagePrompt?: string };
    sceneType?: 'lesson' | 'quiz';
    sceneSectionIds?: string[];
    initialWbLedger?: Array<{ agentName: string; actionName: string; params: Record<string, unknown> }>;
    userProfile?: { nickname?: string; bio?: string };
  };

  if (!classroomId || !question?.trim()) {
    res.status(400).json({ error: 'classroomId and question are required' });
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

    const engine = new DirectorEngine(
      {
        agents:          directorAgents,
        topic:           question,
        mode:            'ask',
        userProfile,
        initialWbLedger: initialWbLedger ?? [],
      },
      callAI,
    );

    let anySucceeded = false;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const decision = engine.decide();

      // 'ask' mode always terminates with 'end' (class resumes automatically)
      if (decision.action === 'end' || decision.action === 'cue_user') break;

      const agent = directorAgents.find((a) => a.id === decision.agentId);
      if (!agent) break;

      send({ type: 'agent_start', agentId: agent.id, agentName: agent.name, agentRole: agent.role });

      const promptInput: DiscussionPromptInput = {
        agentId:            agent.id,
        agentName:          agent.name,
        agentRole:          agent.role,
        agentPersona:       agent.persona ?? '',
        discussionTopic:    question,
        studentMessage:     question,
        sceneTitle,
        sceneImage,
        sceneType,
        sceneSectionIds,
        isInitiating:       engine.getAgentResponses().length === 0,
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
          engine.recordTurn(
            { agentId: agent.id, agentName: agent.name, contentPreview: '', wbActionCount: 0 },
            [],
          );
          continue;
        }

        const speechParts: string[] = [];
        const whiteboardActions: Array<{ name: string; params?: Record<string, unknown> }> = [];

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

        const finalSpeech = speech || '…';

        engine.recordTurn(
          {
            agentId:        agent.id,
            agentName:      agent.name,
            contentPreview: finalSpeech.slice(0, 130),
            wbActionCount:  whiteboardActions.length,
          },
          whiteboardActions,
        );

        send({
          type: 'agent_response',
          agentId:          agent.id,
          agentName:        agent.name,
          agentRole:        agent.role,
          speech:           finalSpeech,
          whiteboardActions,
        });
        anySucceeded = true;
      } catch (agentErr) {
        console.error(`[ask] Agent ${agent.name} failed:`, agentErr);
        engine.recordTurn(
          { agentId: agent.id, agentName: agent.name, contentPreview: '', wbActionCount: 0 },
          [],
        );
      }
    }

    if (!anySucceeded) {
      send({ type: 'error', message: 'Agents failed to respond to the question' });
    }
  } catch (err) {
    console.error('[ask] Fatal error:', err);
    send({ type: 'error', message: 'Q&A generation failed' });
  } finally {
    send({ type: 'done' });
    res.end();
  }
});

export const askRouter = router;
