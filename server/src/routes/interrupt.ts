/**
 * Live Interrupt Route
 *
 * POST /api/interrupt
 *
 * Called by the classroom client after each teacher speech block completes.
 * Each non-teacher agent (assistant, student) independently decides whether
 * to react in character. Agents can stay silent by returning [].
 *
 * STREAMING — Server-Sent Events (text/event-stream).
 *
 * Event shapes:
 *   { type: 'agent_start',    agentId, agentName, agentRole }
 *   { type: 'agent_response', agentId, agentName, agentRole, speech }
 *   { type: 'done' }
 *
 * Unlike a full discussion round, this endpoint:
 *   – Only runs non-teacher agents (teacher is already narrating the lesson)
 *   – Does NOT mandate responses — agents may stay silent
 *   – Returns no whiteboard actions (interrupts are verbal only)
 *   – Is low-latency: 0–2 short agent responses per teacher line
 */

import { Router }       from 'express';
import { protect }      from '../middleware/auth.js';
import { Classroom }    from '../models/Classroom.js';
import { createAICallFnForUser } from '../ai/llm.js';
import {
  buildInterruptSystemPrompt,
  buildInterruptUserPrompt,
  type InterruptPromptInput,
} from '../orchestration/agent-interrupt.js';

const router = Router();

// ── Agent config shape (subset of the stored schema) ──────────────────────────
interface AgentConfig {
  id: string;
  name: string;
  role: string;
  persona?: string;
}

// ── Route ──────────────────────────────────────────────────────────────────────

/**
 * POST /api/interrupt
 *
 * Body:
 * {
 *   classroomId:      string   — to look up agent configs
 *   teacherSpeech:    string   — exact teacher text that just finished playing
 *   sceneTitle?:      string
 *   sceneDescription?: string
 *   userProfile?:     { nickname?: string; bio?: string }
 * }
 */
router.post('/', protect, async (req, res): Promise<void> => {
  const {
    classroomId,
    teacherSpeech,
    sceneTitle,
    sceneDescription,
    userProfile,
  } = req.body as {
    classroomId: string;
    teacherSpeech: string;
    sceneTitle?: string;
    sceneDescription?: string;
    userProfile?: { nickname?: string; bio?: string };
  };

  if (!classroomId || !teacherSpeech?.trim()) {
    res.status(400).json({ error: 'classroomId and teacherSpeech are required' });
    return;
  }

  const classroom = await Classroom.findById(classroomId).lean().catch(() => null);
  if (!classroom) {
    res.status(404).json({ error: 'Classroom not found' });
    return;
  }

  // ── Open SSE stream ──────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const send = (event: Record<string, any>) =>
    res.write(`data: ${JSON.stringify(event)}\n\n`);

  // Only non-teacher agents react to teacher speech
  const agents = (classroom.agentConfigs ?? []) as AgentConfig[];
  const reactingAgents = agents
    .filter((a) => a.role !== 'teacher')
    // assistant first, then student
    .sort((a, b) => {
      const p: Record<string, number> = { assistant: 0, student: 1 };
      return (p[a.role] ?? 2) - (p[b.role] ?? 2);
    });

  if (reactingAgents.length === 0) {
    send({ type: 'done' });
    res.end();
    return;
  }

  // ── Run agents ───────────────────────────────────────────────────────────────
  try {
    const callAI = await createAICallFnForUser(req.userId ?? '');

    // Tracks how many agents have already spoken during this interrupt call.
    // Passed to each agent so later agents know how chatty their peers were.
    let interruptCountThisScene = 0;

    for (const agent of reactingAgents) {
      send({
        type: 'agent_start',
        agentId:   agent.id,
        agentName: agent.name,
        agentRole: agent.role,
      });

      const promptInput: InterruptPromptInput = {
        agentId:                 agent.id,
        agentName:               agent.name,
        agentRole:               agent.role,
        agentPersona:            agent.persona ?? '',
        teacherSpeech,
        sceneTitle:              sceneTitle ?? '',
        sceneDescription,
        userProfile,
        interruptCountThisScene,
      };

      try {
        const raw = await callAI(
          buildInterruptSystemPrompt(promptInput),
          buildInterruptUserPrompt(promptInput),
        );

        // Parse — expect [] or [{"type":"text","content":"..."}]
        let items: Array<{ type: string; content?: string }> = [];
        try {
          const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
          const parsed  = JSON.parse(cleaned);
          items = Array.isArray(parsed) ? parsed : [];
        } catch {
          items = [];
        }

        const speech = items
          .filter((i) => i.type === 'text' && i.content?.trim())
          .map((i) => i.content!.trim())
          .join(' ')
          .trim();

        if (!speech) continue; // agent chose silence — that is perfectly valid

        send({
          type:             'agent_response',
          agentId:          agent.id,
          agentName:        agent.name,
          agentRole:        agent.role,
          speech,
          whiteboardActions: [],
        });

        interruptCountThisScene++;
      } catch (agentErr) {
        // A single agent failure is non-critical — skip and continue
        console.error(`[interrupt] Agent ${agent.name} failed:`, agentErr);
      }
    }
  } catch (err) {
    // Top-level failure: don't crash the client, just end the stream cleanly
    console.error('[interrupt] Fatal error:', err);
  } finally {
    send({ type: 'done' });
    res.end();
  }
});

export const interruptRouter = router;
