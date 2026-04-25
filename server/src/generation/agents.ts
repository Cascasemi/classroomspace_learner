/**
 * Classroom Agents — Phase 3
 *
 * Default agent roster for NeuroSpace classrooms:
 *   - Ms. Nova (teacher)
 *   - Jamie  (assistant)
 *   - Alex   (curious student)
 *
 * The `agentId` on each speech action in the final scenes tells the frontend
 * which character to display in the speech bubble.
 */

import type { AgentInfo, AgentConfig, AICallFn } from './types';
import { parseJsonResponse } from './json-repair';
import {
  pickAvatar,
  getVoiceHint,
  inferGenderFromName,
  getFallbackAvatar,
  DEFAULT_AGENT_AVATARS,
  type Gender,
} from '../lib/avatar-map';

function withVoiceIdentity<T extends NonNullable<AgentConfig['voiceHint']>>(voiceHint: T, index: number): T {
  return {
    ...voiceHint,
    voiceId: voiceHint.voiceId ?? `agent-voice-${index + 1}`,
    voiceIndex: voiceHint.voiceIndex ?? index,
  };
}

// ── Default agent definitions ────────────────────────────────────────────────

const DEFAULT_AGENTS_RAW: AgentConfig[] = [
  {
    id: 'agent-1',
    name: 'Ms. Nova',
    role: 'teacher',
    persona: `You are the lead teacher of this classroom. You teach with clarity, warmth, and genuine enthusiasm for the subject matter.

Your teaching style:
- Explain concepts step by step, building from what students already know
- Use vivid analogies, real-world examples, and relatable comparisons to make abstract ideas concrete
- Pause to check understanding — ask rhetorical questions, don't just lecture
- Adapt your pace: slow down for difficult parts, move confidently through familiar ground
- Encourage students by name when they contribute, and gently correct mistakes without embarrassment

Tone: Professional yet approachable. Patient. Encouraging. You genuinely care about whether students understand.`,
    avatar: DEFAULT_AGENT_AVATARS['agent-1'].path,
    color: '#3b82f6',
    priority: 10,
    voiceHint: withVoiceIdentity(getVoiceHint('female', 'teacher'), 0),
  },
  {
    id: 'agent-2',
    name: 'Jamie',
    role: 'assistant',
    persona: `You are the teaching assistant. You support the lead teacher by filling in gaps, rephrasing, and making sure nobody is left behind.

Your style:
- When a student might be confused, rephrase the teacher's explanation in simpler terms or from a different angle
- Provide concrete, practical examples that make concepts relatable
- Proactively offer background context the teacher might skip
- Summarize key takeaways after complex explanations
- You play a supportive role — you don't take over the lesson, but you make sure everyone keeps up

Tone: Friendly, warm, down-to-earth. Like a helpful older classmate who just "gets it."`,
    avatar: DEFAULT_AGENT_AVATARS['agent-2'].path,
    color: '#10b981',
    priority: 7,
    voiceHint: withVoiceIdentity(getVoiceHint('female', 'assistant'), 1),
  },
  {
    id: 'agent-3',
    name: 'Alex',
    role: 'student',
    persona: `You are the endlessly curious student. You always have a question — and your questions push the whole class to think deeper.

Your personality:
- You ask "why" and "how" constantly — not to be annoying, but because you genuinely want to understand
- You notice details others might miss and ask about edge cases or real-world applications
- You're not afraid to say "I don't get it" — your honesty helps others who were too shy to ask
- You get excited when you learn something new and express that enthusiasm openly
- Keep your contributions SHORT: one curious question or observation, not paragraphs

Tone: Eager, enthusiastic, occasionally puzzled. You speak with the excitement of someone discovering things for the first time.`,
    avatar: DEFAULT_AGENT_AVATARS['agent-3'].path,
    color: '#f59e0b',
    priority: 5,
    voiceHint: withVoiceIdentity(getVoiceHint('male', 'student'), 2),
  },
  {
    id: 'agent-4',
    name: 'Jordan',
    role: 'student',
    persona: `You are the sharp, practical student who bridges theory and real life. You push back — not to challenge authority, but because you genuinely want to understand the "so what?"

Your personality:
- You constantly connect content to real-world scenarios, careers, or everyday situations
- When something seems abstract or useless you ask "Ok, but when would I actually use this?"
- You play devil's advocate — point out edge cases, exceptions, or situations where the rule breaks
- You celebrate moments when pieces click together: "Oh wait — that's just like when..."
- Keep contributions SHORT: one grounding observation or connecting question per turn

Tone: Direct, street-smart, relatable. You are the voice of practicality in the room.`,
    avatar: DEFAULT_AGENT_AVATARS['agent-4'].path,
    color: '#8b5cf6',
    priority: 4,
    voiceHint: withVoiceIdentity(getVoiceHint('male', 'student'), 3),
  },
];

// ── Public accessors ─────────────────────────────────────────────────────────

/**
 * Return lightweight AgentInfo objects for use in prompt formatters and
 * scene-generator calls.
 */
export function getDefaultAgents(): AgentInfo[] {
  return DEFAULT_AGENTS_RAW.map(({ id, name, role, persona }) => ({
    id,
    name,
    role,
    persona,
  }));
}

/**
 * Return full AgentConfig objects for embedding in the persisted classroom
 * for embedding in the persisted classroom.
 */
export function getDefaultAgentConfigs(): AgentConfig[] {
  return DEFAULT_AGENTS_RAW;
}

/**
 * Enforce the 4–10 agent count rule:
 *   - Fewer than 4 → pad with extra default agents until we reach 4
 *   - More than 10 → trim to 10 (keep highest-priority first)
 * Always ensures every agent has a voiceHint assigned.
 */
export function clampAgents(agents: AgentConfig[]): AgentConfig[] {
  const MIN = 4;
  const MAX = 10;

  // Ensure every agent has a voice
  const withVoices = agents.map((a, i): AgentConfig => ({
    ...a,
    voiceHint: a.voiceHint ?? FALLBACK_VOICES[i % FALLBACK_VOICES.length],
  }));

  // Trim to max first
  const trimmed = withVoices.slice(0, MAX);

  // Pad from defaults if needed
  if (trimmed.length < MIN) {
    const defaults = DEFAULT_AGENTS_RAW.filter(
      (d) => !trimmed.some((a) => a.id === d.id),
    );
    while (trimmed.length < MIN && defaults.length) {
      trimmed.push(defaults.shift()!);
    }
  }

  return trimmed;
}

const FALLBACK_VOICES: AgentConfig['voiceHint'][] = [
  { lang: 'en-US', voiceId: 'fallback-1', voiceIndex: 0, rate: 0.9,  pitch: 1.0  },
  { lang: 'en-US', voiceId: 'fallback-2', voiceIndex: 1, rate: 1.0,  pitch: 1.1  },
  { lang: 'en-US', voiceId: 'fallback-3', voiceIndex: 2, rate: 1.1,  pitch: 1.25 },
  { lang: 'en-US', voiceId: 'fallback-4', voiceIndex: 3, rate: 1.05, pitch: 0.95 },
];

// ── Prompt formatters ───────────────────────────────────────────────────────

/**
 * Build a persona block describing the lead teacher so the LLM can
 * calibrate the voice and delivery of generated content.
 */
export function formatTeacherPersonaForPrompt(agents: AgentInfo[]): string {
  const lead = agents.find((a) => a.role === 'teacher');
  if (!lead?.persona) return '';

  return [
    '=== Lead Teacher ===',
    `Name: ${lead.name}`,
    '',
    lead.persona,
    '',
    'Content guidance: Write all sections, headings, and callout titles in a voice that reflects this teacher\'s style. Do NOT embed the teacher\'s name in any heading, label, or slide title.',
  ].join('\n');
}

/**
 * Build a classroom roster block for action-generation prompts.
 * Agents are grouped by role so the LLM can distribute speech naturally
 * (teacher leads, assistant fills gaps, students ask/react).
 * Every speech action MUST reference one of the ids listed here.
 */
export function formatAgentsForPrompt(agents: AgentInfo[]): string {
  if (agents.length === 0) return '';

  const order: Array<AgentInfo['role']> = ['teacher', 'assistant', 'student'];
  const grouped = order
    .map((role) => ({ role, members: agents.filter((a) => a.role === role) }))
    .filter((g) => g.members.length > 0);

  const lines: string[] = ['=== Classroom Roster (assign agentId on every speech action) ==='];
  for (const { role, members } of grouped) {
    const label = role.charAt(0).toUpperCase() + role.slice(1);
    lines.push(`\n${label}${members.length > 1 ? 's' : ''}:`);
    for (const a of members) {
      const hint = a.persona ? `  // ${a.persona.split('\n')[0].slice(0, 72)}` : '';
      lines.push(`  agentId "${a.id}"  →  ${a.name}${hint}`);
    }
  }
  return lines.join('\n');
}

// ── LLM-generated agents ────────────────────────────────────────────────────

/**
 * Ask the LLM to generate a custom set of agents for the given topic.
 * Falls back to defaults if generation fails.
 */
export async function generateAgentProfiles(
  requirement: string,
  language: string,
  callAI: AICallFn,
): Promise<AgentConfig[]> {
  const systemPrompt =
    'You are an expert instructional designer. Generate agent profiles for a multi-agent classroom. Return ONLY valid JSON, no markdown.';

  const userPrompt = `Generate agent profiles for a course on:
${requirement}

Requirements:
- Between 4 and 6 agents total
- Exactly 1 must have role "teacher", 1–2 "assistant", 2–3 "student"
- Each needs: name, role, persona (2-3 sentences matching the subject)
- Names and personas must be in language: ${language}
- Personas should reference the subject matter
- Every agent must feel distinct — different personality, speech style, and perspective

Return exactly this JSON shape:
{
  "agents": [
    { "name": "string", "role": "teacher" | "assistant" | "student", "persona": "string" }
  ]
}`;

  try {
    const raw = await callAI(systemPrompt, userPrompt);
    const parsed = parseJsonResponse<{ agents: Array<{ name: string; role: string; persona: string }> }>(raw);
    if (!parsed?.agents || parsed.agents.length < 3) throw new Error('Too few agents returned');

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6'];
    const PRIORITIES: Record<string, number> = { teacher: 10, assistant: 7, student: 5 };

    const generated = parsed.agents.map((a, i) => {
      const role = a.role as 'teacher' | 'assistant' | 'student';
      const gender: Gender = inferGenderFromName(a.name);
      const avatarEntry = pickAvatar(role, i, gender);
      return {
        id: `gen-agent-${i + 1}`,
        name: a.name,
        role,
        persona: a.persona,
        avatar: avatarEntry.path,
        color: COLORS[i] ?? '#6366f1',
        priority: PRIORITIES[a.role] ?? 5,
        voiceHint: withVoiceIdentity(getVoiceHint(gender, role), i),
      };
    });

    return clampAgents(generated);
  } catch (err) {
    console.warn('[agents] generateAgentProfiles failed, using defaults:', err);
    return clampAgents(getDefaultAgentConfigs());
  }
}
