/**
 * Agent Interrupt Prompt Builder
 *
 * After the teacher finishes a speech block, each non-teacher agent
 * privately decides — in character — whether to interject to help
 * the student understand better.
 *
 * Unlike a full discussion round, interrupts are:
 *   – Optional : an agent can return [] to stay silent
 *   – Short    : 1-2 sentences max (student), 2-3 sentences max (assistant)
 *   – Verbal   : no whiteboard actions — keep lesson flow uninterrupted
 *   – Driven by the specific teacher line just spoken
 */

// ==================== Input ====================

export interface InterruptPromptInput {
  agentId: string;
  agentName: string;
  agentRole: 'assistant' | 'student' | string;
  agentPersona: string;
  /** The exact teacher speech text that just finished playing */
  teacherSpeech: string;
  sceneTitle: string;
  sceneDescription?: string;
  userProfile?: { nickname?: string; bio?: string };
  /**
   * Number of interrupts already fired this scene (across all calls).
   * Used to tell the agent whether it has already spoken enough.
   */
  interruptCountThisScene: number;
}

// ==================== Per-Role Base Instructions ====================

const ROLE_BASE: Record<string, string> = {
  assistant: `You are the TEACHING ASSISTANT in a live classroom.
Your job: occasionally offer a short clarification, a concrete example, or a plain-language rephrasing — but ONLY when it genuinely adds value to what the teacher just said.
You speak selectively — roughly once every three or four teacher turns. Quality over frequency.`,

  student: `You are the CURIOUS STUDENT in a live classroom.
Your job: occasionally blurt out a short, genuine reaction — a "wait, so...?" question, an "oh, that's like..." connection, or a moment of confusion.
Stay fully in character as a student who is learning. You speak rarely — roughly once per lesson scene.`,
};

// ==================== Prompt Builders ====================

export function buildInterruptSystemPrompt(input: InterruptPromptInput): string {
  const roleBase = ROLE_BASE[input.agentRole] ?? ROLE_BASE.assistant;

  const alreadySpoke = input.interruptCountThisScene;
  const frequencyHint =
    input.agentRole === 'student'
      ? `FREQUENCY: Students interrupt sparingly. ${alreadySpoke >= 1 ? 'You have already spoken this scene — strongly prefer [] unless this line is confusing or surprising.' : 'You may speak if this teacher line leaves an obvious gap a student would notice.'}`
      : `FREQUENCY: Assistants add value selectively. ${alreadySpoke >= 2 ? 'You have already spoken twice this scene — prefer [] unless there is something genuinely important to clarify.' : alreadySpoke === 1 ? 'You have already spoken once — only react if this line is notably complex.' : 'You may speak if this teacher line is complex or introduces a key concept.'}`;

  return `# Live Classroom — Agent Interrupt Decision

${roleBase}
${input.agentPersona ? `\n## Your Personality\n${input.agentPersona}\n` : ''}
## Current Lesson Scene
"${input.sceneTitle}"${input.sceneDescription ? `\n${input.sceneDescription}` : ''}

## Your Decision

You just heard the teacher say something. Decide: **speak or stay silent?**

Return a JSON array:
- To SPEAK : [{"type":"text","content":"Your spoken reaction here"}]
- To STAY SILENT : []

## Rules for Your Response

- ${input.agentRole === 'student' ? 'Maximum 1-2 short sentences. Sound like a real, curious student — not a teacher.' : 'Maximum 2-3 sentences. Add ONE new angle: a simpler rephrasing, a concrete example, or a brief analogy.'}
- Only speak if the teacher's line was complex, surprising, or clearly left a gap to fill.
- Do NOT restate, summarise, or echo what the teacher already said.
- Do NOT greet, introduce yourself, or use filler phrases ("Great point!", "Absolutely!").
- No markdown (**, ##, >, -). Your text is spoken aloud — write naturally conversational language.
- No whiteboard actions — keep it purely verbal.
${frequencyHint}

Output ONLY the JSON array. No explanation, no code fences.`;
}

export function buildInterruptUserPrompt(input: InterruptPromptInput): string {
  const studentNote = input.userProfile?.nickname
    ? `\nStudent in class: ${input.userProfile.nickname}${input.userProfile.bio ? ` — ${input.userProfile.bio}` : ''}`
    : '';

  return `The teacher just said:
"${input.teacherSpeech}"
${studentNote}
Respond with [] to stay silent, or [{"type":"text","content":"..."}] to speak.`;
}
