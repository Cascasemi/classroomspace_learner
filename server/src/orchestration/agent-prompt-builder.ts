/**
 * Agent Prompt Builder — Openclass_learner Live Discussion Mode
 *
 * Constructs system and user prompts for three classroom agents
 * (teacher, assistant, student) during live discussion breaks.
 *
 * Agents always respond with a **JSON array** of items:
 *   { "type": "text",   "content": "spoken words"              }
 *   { "type": "action", "name": "wb_draw_latex", "params": {} }
 *   { "type": "action", "name": "spotlight",     "params": { "elementId": "section_abc" } }
 *
 * Openclass_learner classroom surfaces:
 *   – Whiteboard: always available (drawing canvas).
 *   – Spotlight / Laser: available on lesson slides — focus student attention on a section.
 *   – English-only instruction set.
 *   – Simplified state context (topic + scene).
 */

// ==================== Whiteboard Action Catalogue ====================

const WB_ACTION_CATALOGUE = `
wb_open         — Show the whiteboard panel. Always call before the first draw action.
wb_close        — Hide the whiteboard. Rarely needed — leave it open so students can study it.
wb_clear        — Erase every element and blank the canvas.
wb_delete       — Remove one element by its tracked ID.
  params: { elementId: string }
wb_draw_text    — Place a text block anywhere on the canvas.
  params: { content, x, y, width?, height?, fontSize?, color?, bold?, italic?, elementId? }
wb_draw_shape   — Draw a filled shape (rectangle | circle | triangle | diamond | arrow).
  params: { shape, x, y, width, height, fill?, stroke?, strokeWidth?, label?, elementId? }
wb_draw_chart   — Render a data chart (bar | line | pie).
  params: { chartType, labels:string[], datasets:[{label,data:number[],color?}], x, y, width, height, title?, elementId? }
wb_draw_latex   — Render a KaTeX formula. Width auto-computed; you set height only.
  params: { latex, x, y, height, color?, fontSize?, elementId? }
  fontSize is optional (virtual px). Defaults to height×0.5. Use fontSize:36 for normal equations, fontSize:52 for large display formulas.
wb_draw_table   — Lay out a data table; first row is rendered as the header.
  params: { data:string[][], x, y, width, height, elementId? }
wb_draw_line    — Draw a straight line or arrow between two canvas points.
  params: { startX, startY, endX, endY, stroke?, strokeWidth?, points?:["arrow"], elementId? }
`.trim();

/**
 * Return the subset of `WB_ACTION_CATALOGUE` lines that correspond to the
 * actions in `allowed`.  If `allowed` is undefined or empty the full
 * catalogue is returned (backward-compatible).
 */
function buildFilteredWbCatalogue(allowed: string[] | undefined): string {
  if (!allowed || allowed.length === 0) return WB_ACTION_CATALOGUE;

  const allowedSet = new Set(allowed);
  // Split into per-action blocks.  A block starts at a line that begins with
  // a word character (the action name) and includes all immediately following
  // lines that are indented (parameter docs).
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of WB_ACTION_CATALOGUE.split('\n')) {
    if (line.length > 0 && !/^\s/.test(line)) {
      // New action — flush previous block
      if (current.length > 0) blocks.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current.join('\n'));

  return blocks
    .filter(block => {
      const actionName = block.split(/\s/)[0];
      return allowedSet.has(actionName);
    })
    .join('\n');
}

// ==================== Role Guidelines ====================

const ROLE_GUIDELINES: Record<string, string> = {
  teacher: `Your role in this classroom: LEAD TEACHER.
You are responsible for:
  – Driving the discussion: framing questions, controlling pace, deepening inquiry
  – Explaining concepts through examples, diagrams, and whiteboard visuals
  – Posing challenges that make the student think — not just handing over answers
  – Using the whiteboard naturally for formulas, charts, tables, and step-by-step reasoning
Never narrate your own actions — just teach. Own the room.`,

  assistant: `Your role in this classroom: TEACHING ASSISTANT.
You are responsible for:
  – Reinforcing and extending the teacher's points — never overshadowing them
  – Rephrasing complex ideas in plainer terms when a student seems lost
  – Offering a quick concrete example or a fresh analogy, then stepping back
  – Adding whiteboard content only when it supplements — not duplicates — the teacher's work
Your turn should always feel shorter and lighter than the teacher's.`,

  student: `Your role in this classroom: CURIOUS STUDENT.
You are responsible for:
  – Reacting genuinely — with a question, an "aha", a pushback, or a confession of confusion
  – Keeping every response to 1-2 sentences. You are NOT here to explain things.
  – Using the whiteboard only when the teacher explicitly invites you to do so
Short, punchy, real. Think out loud — don't lecture.`,
};

// ==================== Agent Turn Summary ====================

/**
 * Compact summary of one agent's completed turn this round.
 * Used to build peer-context sections so subsequent agents
 * don't repeat what was already said.
 */
export interface AgentTurnSummary {
  agentId: string;
  agentName: string;
  /** First ~130 chars of the agent's concatenated speech */
  contentPreview: string;
  /** How many whiteboard actions the agent emitted */
  wbActionCount: number;
}

// ==================== Peer Context ====================

/**
 * Build the "what agents have already said this round" section.
 * Returns an empty string when the current agent is first in the queue.
 */
function buildPeerContextSection(
  priorTurns: AgentTurnSummary[] | undefined,
  currentAgentName: string,
): string {
  if (!priorTurns || priorTurns.length === 0) return '';

  const others = priorTurns.filter((t) => t.agentName !== currentAgentName);
  if (others.length === 0) return '';

  const lines = others
    .map((t) => `  – ${t.agentName}: "${t.contentPreview}${t.contentPreview.length >= 130 ? '...' : ''}"`)
    .join('\n');

  return `
# This Round's Context — READ CAREFULLY BEFORE RESPONDING
The agents listed below have already spoken during this discussion turn:
${lines}

You are ${currentAgentName}, responding AFTER the speakers above. You MUST:
1. Skip all greetings and introductions — they have already happened.
2. Not restate or echo anything a prior speaker already explained.
3. Bring something genuinely new from YOUR perspective as ${currentAgentName}.
4. Build on, question, or extend prior content — do not mirror it.
5. If you agree with something said earlier, acknowledge it in a single clause and then move forward.
`;
}

// ==================== Length Guidelines ====================

/**
 * Role-calibrated speaking length and style constraints.
 * All counts apply to text content only — whiteboard actions don't count toward length.
 */
function buildLengthGuidelines(role: string): string {
  const shared = `
– Length targets apply to spoken text only (type:"text"). Actions are free and don't count.
– Conversational English — this is a live classroom, not a journal article.
– No markdown in text content (**, ##, >, -, code fences). Text is spoken aloud, not rendered.`;

  if (role === 'teacher') {
    return `– Target ~80-120 words of spoken text across all text items. Two or three crisp sentences beat one long paragraph.
– Aim to make the student THINK: open with a provocative question, give the key insight, then pause for a reaction.
– Pair whiteboard content with speech — draw first, then speak about what appeared.${shared}`;
  }

  if (role === 'assistant') {
    return `– Target ~40-70 words. You are a supporting act — keep it tight.
– Add exactly one new angle: a simpler rephrasing, a concrete example, or a quick analogy.
– One whiteboard element per turn maximum unless the concept genuinely demands more.${shared}`;
  }

  // student
  return `– Target ~10-25 words. One reaction only — a question, an observation, or a short "wait, so...".
– If your response is as long as the teacher's, you have misunderstood your role.
– Sound like a student: curious, occasionally puzzled, sometimes excited. Never preachy.${shared}`;
}

// ==================== Whiteboard Guidelines ====================

/**
 * Role-calibrated whiteboard usage rules, including layout math,
 * LaTeX sizing, delete-and-redraw animation, and deduplication.
 */
function buildWhiteboardGuidelines(role: string): string {
  const layout = `Canvas: 1000 × 562 px virtual coordinates. Safe area: x 20–980, y 20–542.
Maintain at least 20 px between elements.
Vertical stacking formula: next_y = prev_y + prev_height + 30.
Two-column layout: left x 20–480, right x 520–980.
All element bounding boxes must fit inside the canvas — check x + width ≤ 1000 and y + height ≤ 562.`;

  const latexTable = `
LaTeX Sizing (wb_draw_latex — KaTeX displayMode; width is auto-computed from height):
┌─────────────────────────────────┬────────────────────┐
│ Formula category                │ Suggested height   │
├─────────────────────────────────┼────────────────────┤
│ Simple inline  (E=mc²)          │ 50–70              │
│ Fraction / quadratic            │ 70–100             │
│ Integral or limit               │ 80–110             │
│ Summation with limits           │ 90–120             │
│ 3×3 or larger matrix            │ 130–180            │
│ Nested fractions                │ 80–120             │
└─────────────────────────────────┴────────────────────┘
Always set height. For vertical stacking, gap = height + 30 px.
All standard KaTeX math commands are supported.`;

  const lineNote = `wb_draw_line uses absolute canvas coordinates for all four endpoints.
Include { "points": ["arrow"] } to add an arrowhead at the end.`;

  const dedup = `Before drawing, scan "Current Whiteboard State" for existing elements.
Do NOT redraw content that is already on the canvas — reference it instead.
Use wb_delete (by elementId) for targeted updates; use wb_clear only for full resets.`;

  if (role === 'teacher') {
    return `${layout}

${dedup}

Animate with delete-and-redraw (elementId is key):
  Call wb_draw_* with { elementId: "obj_1" } → speak → call wb_delete { elementId: "obj_1" }
  → call wb_draw_* at a new position or with updated content.
  This creates perceived motion and step-by-step reveals without clearing the entire board.

${latexTable}

${lineNote}`;
  }

  if (role === 'assistant') {
    return `${layout}

The whiteboard primarily belongs to the teacher. As assistant, draw sparingly.
Limit yourself to 1–2 small supplementary elements per turn. Prefer speech over drawing.
Do not add parallel derivations or duplicate the teacher's existing content.

${latexTable}`;
  }

  // student
  return `The whiteboard belongs to the teacher. Do NOT use it unless directly invited.
When invited, add only what was explicitly requested — one element, neatly placed.
Do not clear or delete existing content.`;
}

// ==================== Virtual Whiteboard Context ====================

/**
 * A single whiteboard-action record from the cross-agent ledger.
 * Populated by discuss.ts as each agent completes its turn.
 */
export interface WBLedgerRecord {
  agentName: string;
  actionName: string;
  params: Record<string, unknown>;
}

/**
 * Replay the cross-agent whiteboard ledger to produce an attributed
 * element list for the upcoming agent's system prompt.
 *
 * – wb_clear resets the accumulated list.
 * – wb_delete removes by elementId.
 * – wb_draw_* appends a summary entry attributed to the drawing agent.
 * – wb_open / wb_close are structural, not content — they are ignored.
 *
 * Returns an empty string when the ledger is empty (zero prompt overhead).
 */
function buildVirtualWhiteboardContext(ledger?: WBLedgerRecord[]): string {
  if (!ledger || ledger.length === 0) return '';

  interface TrackedEl {
    agentName: string;
    summary: string;
    elementId?: string;
  }

  const tracked: TrackedEl[] = [];

  for (const rec of ledger) {
    const p = rec.params;

    switch (rec.actionName) {
      case 'wb_clear':
        tracked.length = 0;
        break;

      case 'wb_delete': {
        const delId = String(p.elementId ?? '');
        const idx = tracked.findIndex((el) => el.elementId === delId);
        if (idx >= 0) tracked.splice(idx, 1);
        break;
      }

      case 'wb_draw_text': {
        const snippet = String(p.content ?? '').slice(0, 45);
        tracked.push({
          agentName: rec.agentName,
          summary: `text: "${snippet}${snippet.length >= 45 ? '...' : ''}" at (${p.x ?? '?'},${p.y ?? '?'}), ~${p.width ?? 400}×${p.height ?? 100}`,
          elementId: String(p.elementId ?? ''),
        });
        break;
      }

      case 'wb_draw_shape': {
        const kind = String(p.shape ?? p.type ?? 'rectangle');
        tracked.push({
          agentName: rec.agentName,
          summary: `shape(${kind}) at (${p.x ?? '?'},${p.y ?? '?'}), ${p.width ?? '?'}×${p.height ?? '?'}`,
          elementId: String(p.elementId ?? ''),
        });
        break;
      }

      case 'wb_draw_chart': {
        const ct = String(p.chartType ?? 'bar');
        const rawLabels = (p.data as Record<string, unknown> | undefined)?.labels ?? p.labels;
        const labelStr = Array.isArray(rawLabels)
          ? (rawLabels as string[]).slice(0, 4).join(', ')
          : '';
        tracked.push({
          agentName: rec.agentName,
          summary: `chart(${ct})${labelStr ? `: [${labelStr}]` : ''} at (${p.x ?? '?'},${p.y ?? '?'}), ${p.width ?? '?'}×${p.height ?? '?'}`,
          elementId: String(p.elementId ?? ''),
        });
        break;
      }

      case 'wb_draw_latex': {
        const formula = String(p.latex ?? '').slice(0, 45);
        tracked.push({
          agentName: rec.agentName,
          summary: `latex: "${formula}${formula.length >= 45 ? '...' : ''}" at (${p.x ?? '?'},${p.y ?? '?'}), height ${p.height ?? 80}`,
          elementId: String(p.elementId ?? ''),
        });
        break;
      }

      case 'wb_draw_table': {
        const data = p.data as unknown[][] | undefined;
        const rows = data?.length ?? 0;
        const cols = (data?.[0] as unknown[] | undefined)?.length ?? 0;
        tracked.push({
          agentName: rec.agentName,
          summary: `table(${rows}×${cols}) at (${p.x ?? '?'},${p.y ?? '?'}), ${p.width ?? '?'}×${p.height ?? '?'}`,
          elementId: String(p.elementId ?? ''),
        });
        break;
      }

      case 'wb_draw_line': {
        const hasArrow = Array.isArray(p.points) && (p.points as string[]).includes('arrow');
        tracked.push({
          agentName: rec.agentName,
          summary: `line${hasArrow ? ' (arrow)' : ''}: (${p.startX ?? '?'},${p.startY ?? '?'}) → (${p.endX ?? '?'},${p.endY ?? '?'})`,
          elementId: String(p.elementId ?? ''),
        });
        break;
      }
      // wb_open, wb_close — no content tracking needed
    }
  }

  if (tracked.length === 0) return '';

  const lines = tracked
    .map((el, i) => `  ${i + 1}. [by ${el.agentName}] ${el.summary}`)
    .join('\n');

  return `
## Whiteboard — Changes Made by Other Agents This Round (IMPORTANT)
${tracked.length} element(s) currently on the canvas from prior agents this turn:
${lines}

Do NOT redraw any of the above. If you need space, use wb_delete by elementId or wb_clear — then rebuild.
Check positions above before placing your own elements to avoid overlap.
`;
}

// ==================== Whiteboard State Summary ====================

export interface WBElementSummary {
  id: string;
  type: string;
  position: string;
  brief: string;
}

function buildWhiteboardStateSection(elements?: WBElementSummary[]): string {
  if (!elements || elements.length === 0) {
    return '\n# Current Whiteboard State\n(empty — canvas is blank)\n';
  }
  const lines = elements.map(
    (el, i) => `  ${i + 1}. [id:${el.id}] ${el.type} at ${el.position} — ${el.brief}`,
  );
  return `
# Current Whiteboard State
${elements.length} element(s) on the canvas:
${lines.join('\n')}
Do NOT redraw the above. Use wb_delete + redraw only to update a specific element.
`;
}

// ==================== Input / Output Types ====================

export interface PeerResponse {
  agentName: string;
  text: string;
}

export interface DiscussionPromptInput {
  agentId: string;
  agentName: string;
  agentRole: string;
  agentPersona: string;
  discussionTopic: string;
  discussionPrompt?: string;
  /** Verbatim student message from ASR transcription */
  studentMessage?: string;
  sceneTitle?: string;
  sceneDescription?: string;
  /** Speech from agents already dispatched this round */
  peerResponses?: PeerResponse[];
  /** true when this agent speaks first in the round */
  isInitiating?: boolean;
  /** Pre-existing whiteboard elements (from last rerender snapshot) */
  whiteboardElements?: WBElementSummary[];
  /** Cross-agent whiteboard ledger for this round */
  wbLedger?: WBLedgerRecord[];
  /** Compact summaries of prior agents' full turns */
  agentTurnSummaries?: AgentTurnSummary[];
  /** Optional student profile for personalisation */
  userProfile?: { nickname?: string; bio?: string };
  /** Whiteboard actions this agent is permitted to emit (from DirectorEngine) */
  allowedWbActions?: string[];
  /**
   * Multi-turn conversation history for discussion-room mode.
   * Rendered in the user prompt so the agent has full chat context.
   */
  conversationHistory?: Array<{
    role: 'user' | 'agent';
    agentName?: string;
    content: string;
  }>;
  /**
   * Image currently displayed on the lesson slide.
   * When present, the agent is expected to treat the image as a primary
   * teaching artefact — explaining its content rather than ignoring it.
   */
  sceneImage?: {
    /** Public URL already resolved (e.g. /api/classroom-media/...) */
    imageUrl: string;
    /** Human-readable caption from the ContentSection */
    caption?: string;
    /** Original generation prompt — describes what the image depicts */
    imagePrompt?: string;
  };
  /**
   * Type of the current scene. When 'lesson', spotlight and laser actions
   * are available and should be included in the action catalogue.
   * When 'quiz' or absent for non-slide scenes, they are omitted.
   */
  sceneType?: 'lesson' | 'quiz';
  /**
   * Section IDs from the current lesson slide. These are the valid values
   * for the elementId field in spotlight and laser actions.
   * Only populated when sceneType === 'lesson'.
   */
  sceneSectionIds?: string[];
}

// ==================== System Prompt Builder ====================

/**
 * Build a full system prompt for a single agent's live discussion turn.
 *
 * The agent outputs a JSON array of text + whiteboard-action items.
 * Each turn is stateless; all context is provided in the system prompt.
 */
export function buildDiscussionSystemPrompt(input: DiscussionPromptInput): string {
  const {
    agentName,
    agentRole,
    agentPersona,
    discussionTopic,
    discussionPrompt,
    studentMessage,
    sceneTitle,
    peerResponses,
    isInitiating,
    whiteboardElements,
    wbLedger,
    agentTurnSummaries,
    userProfile,
    allowedWbActions,
    sceneImage,
    sceneType,
    sceneSectionIds,
  } = input;

  const roleGuideline = ROLE_GUIDELINES[agentRole] ?? ROLE_GUIDELINES.student;
  const lengthGuide   = buildLengthGuidelines(agentRole);
  const wbGuide       = buildWhiteboardGuidelines(agentRole);

  // Prefer richer AgentTurnSummary if available; fall back to legacy PeerResponse
  const peerContext = agentTurnSummaries
    ? buildPeerContextSection(agentTurnSummaries, agentName)
    : buildPeerContextFromLegacy(peerResponses ?? [], agentName);

  // Virtual whiteboard context (changes by other agents this round)
  const virtualWb = buildVirtualWhiteboardContext(wbLedger);

  // Persisted whiteboard snapshot (pre-round elements)
  const wbState = virtualWb ? '' : buildWhiteboardStateSection(whiteboardElements);

  const sceneContext = sceneTitle
    ? `\n# Lesson Context\nThe class is currently covering: "${sceneTitle}"\n`
    : '';

  // Student profile personalisation block
  const profileSection =
    userProfile?.nickname || userProfile?.bio
      ? `\n# Student Profile\nYou are teaching ${userProfile.nickname || 'a student'}.${userProfile.bio ? ` Their background: ${userProfile.bio}` : ''}\nPersonalise your teaching to their context. Use their name naturally.\n`
      : '';

  // Scene image — inject only when the slide has a resolved image
  const sceneImageSection = sceneImage
    ? `\n# Lesson Visual\nThe current lesson slide has a generated image visible to the student.\n` +
      `What it depicts: ${sceneImage.imagePrompt || sceneImage.caption || 'a relevant educational diagram'}\n` +
      (sceneImage.caption ? `Caption: ${sceneImage.caption}\n` : '') +
      `\nYour task is to explain what this image shows and how it connects to the topic — ` +
      `treat it as evidence or a worked example, not decoration.\n` +
      `Anchor your explanation in specific details the student can see: structures, labels, relationships, or trends visible in the image.\n` +
      `If you need to highlight a part or add an annotation, use wb_draw_shape or wb_draw_line on the whiteboard alongside your speech.\n` +
      `Do NOT say the image is \'about to appear\' or \'now visible\' — it is already on screen.\n`
    : '';

  const formatExample =
    `[` +
    `{"type":"action","name":"wb_open","params":{}},` +
    `{"type":"action","name":"wb_draw_text","params":{"content":"Core Idea","x":80,"y":60,"fontSize":26,"bold":true,"color":"#38bdf8","elementId":"title_1"}},` +
    `{"type":"text","content":"Every physical system drifts toward its lowest-energy configuration — that one principle unlocks a lot."},` +
    `{"type":"action","name":"wb_draw_shape","params":{"shape":"arrow","x":60,"y":170","width":420,"height":40,"fill":"#38bdf8","elementId":"arr_1"}},` +
    `{"type":"text","content":"The arrow shows the direction of spontaneous change. What do you think drives it?"}` +
    `]`;

  const discussionSection = isInitiating
    ? `\n# Discussion — Opening Turn
You are STARTING the discussion on: "${discussionTopic}"
${discussionPrompt ? `Guiding prompt: ${discussionPrompt}` : ''}
Introduce the topic naturally and draw something visual to anchor it if you are the teacher.
Speak first — do not wait for user input.`
    : `\n# Discussion — Continuing Turn
Topic: "${discussionTopic}"
${discussionPrompt ? `Guiding prompt: ${discussionPrompt}` : ''}
You are JOINING an ongoing discussion. Do NOT re-introduce the topic or greet anyone.
Challenge an assumption, extend a point, or ask a follow-up — come in with energy.`;

  const studentInputSection = studentMessage
    ? `\n# Student Message\nThe student just said: "${studentMessage}"\nAddress this directly. Validate, correct gently, or build on it — make them feel heard.`
    : '';

  // Visual effects catalogue — only on lesson slides
  // spotlight and laser are fire-and-forget: they appear instantly then
  // auto-clear after 5 s on the frontend, so they never block playback.
  const visualEffectsSection = sceneType === 'lesson'
    ? (() => {
        const ids = sceneSectionIds && sceneSectionIds.length > 0
          ? `Available element IDs on this slide:\n${sceneSectionIds.map((id) => `  – ${id}`).join('\n')}\nUse these exact strings for elementId in spotlight / laser actions.`
          : '';
        return `
## Visual Effects — Lesson Slide Only
Two additional fire-and-forget effects are available when teaching a lesson slide.
They appear immediately and auto-clear after 5 seconds — they never pause playback.

spotlight  — dims the entire slide except the target section (draws the eye)
  {"type":"action","name":"spotlight","params":{"elementId":"section_intro"}}

laser      — places a red pointer dot on the target section
  {"type":"action","name":"laser","params":{"elementId":"section_diagram_1"}}

Ordering rule: emit the visual effect BEFORE the speech that references it.
Point at the element first, then speak — students see it before they hear about it.

Use these sparingly: one effect per teaching beat, only when it genuinely
helps students follow your explanation. Do not use them as decoration.
${ids}`;
      })()
    : '';

  return `# Role
You are ${agentName}.

## Personality
${agentPersona}

## Classroom Role
${roleGuideline}
${profileSection}${sceneContext}${peerContext}
# Output Format
You MUST output a **JSON array** for every response — no exceptions.
Each item is either spoken text or a whiteboard action:

${formatExample}

## Format Rules
1. Single JSON array — no prose, no explanation text, no code fences outside the array.
2. \`type:"action"\` items carry \`name\` and \`params\`.
3. \`type:"text"\` items carry \`content\` — verbatim what you say aloud.
4. Action and text items may interleave in any order.
5. The closing \`]\` terminates your response.
6. CRITICAL: Always begin with \`[\`. Every response is a fresh, complete JSON array.

## Ordering Principles
– Call wb_open BEFORE the first draw action if the whiteboard is not yet open.
– Emit a draw action, then speak about what just appeared — students see it as you talk.
– Leave the whiteboard OPEN when you finish. Only close it if you have a specific reason.

## Speech Rules
– Text content is read aloud. No markdown, no bullet lists, no headings inside text.
– NEVER announce actions: do not say "let me draw", "I'll open the whiteboard", "I'm writing...".
– NEVER describe results: do not say "I've added a chart showing...".
– Students see the visual appear on screen — speak as if they already see it.

## Length & Style
${lengthGuide}

### Good Examples

Teacher opening with a formula:
[{"type":"action","name":"wb_open","params":{}},{"type":"action","name":"wb_draw_latex","params":{"latex":"S = k_B \\\\ln\\\\Omega","x":80,"y":60,"height":90,"color":"#38bdf8","elementId":"f1"}},{"type":"text","content":"This is Boltzmann's entropy formula. What does Omega represent, do you think?"}]

Assistant bridging with an example:
[{"type":"text","content":"Think of an ice cube melting — crystals going to disorder. Entropy rising."}]

Student reacting:
[{"type":"text","content":"Wait — entropy can never decrease on its own? That feels weird."}]

### Bad Examples (DO NOT do these)
[{"type":"text","content":"Let me open the whiteboard for you."},{"type":"action","name":"wb_open","params":{}}]
[{"type":"text","content":"I have drawn a chart showing the relationship between temperature and entropy."}]
[{"type":"text","content":"As your teacher, I will now break down entropy step by step."}]

# Whiteboard Guidelines
${sceneImageSection}${wbGuide}

# Available Actions
${buildFilteredWbCatalogue(allowedWbActions)}
${visualEffectsSection}
${virtualWb || wbState}
# Language
English only. Warm, direct, conversational — a real live classroom.
${discussionSection}${studentInputSection}`;
}

// ==================== Legacy Peer Context Adapter ====================

/**
 * Builds peer context from the simpler PeerResponse[] format (discuss.ts v1).
 * Kept for backward compatibility while discuss.ts migrates to AgentTurnSummary.
 */
function buildPeerContextFromLegacy(
  peers: PeerResponse[],
  currentAgentName: string,
): string {
  if (peers.length === 0) return '';

  const others = peers.filter((p) => p.agentName !== currentAgentName);
  if (others.length === 0) return '';

  const summaries: AgentTurnSummary[] = others.map((p) => ({
    agentId: p.agentName.toLowerCase(),
    agentName: p.agentName,
    contentPreview: p.text.slice(0, 130),
    wbActionCount: 0,
  }));

  return buildPeerContextSection(summaries, currentAgentName);
}

// ==================== User Prompt Builder ====================

export function buildDiscussionUserPrompt(input: DiscussionPromptInput): string {
  const { discussionTopic, studentMessage, isInitiating, agentRole, conversationHistory, userProfile } = input;

  // Build optional conversation history prefix (discussion-room mode)
  let historyPrefix = '';
  if (conversationHistory && conversationHistory.length > 0) {
    const studentName = userProfile?.nickname ?? 'Student';
    const recent = conversationHistory.slice(-8);
    historyPrefix =
      'Recent conversation:\n' +
      recent
        .map((m) =>
          m.role === 'user'
            ? `  ${studentName}: "${m.content.slice(0, 150)}"`
            : `  ${m.agentName ?? 'Agent'}: "${m.content.slice(0, 150)}"`,
        )
        .join('\n') +
      '\n\n';
  }

  if (studentMessage) {
    return (
      historyPrefix +
      `The student said: "${studentMessage}"\n\n` +
      `Respond naturally in the ongoing discussion about "${discussionTopic}". ` +
      `Output a complete JSON array.`
    );
  }

  if (isInitiating) {
    const wbPrompt =
      agentRole === 'teacher'
        ? ' Open the whiteboard and draw something that makes the concept tangible.'
        : '';
    return (
      historyPrefix +
      `Start the discussion about "${discussionTopic}".${wbPrompt} Output a complete JSON array.`
    );
  }

  return (
    historyPrefix +
    `Continue the discussion about "${discussionTopic}". ` +
    `Add your unique perspective — challenge, extend, or question what was said. ` +
    `Output a complete JSON array.`
  );
}

// ==================== Conversation Summary ====================

interface RawMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Produce a condensed plain-text summary of recent conversation history.
 * Useful for passing context to the director without full message payloads.
 *
 * @param messages     OpenAI-format message array to sample from
 * @param maxMessages  How many recent messages to include (default 10)
 * @param maxLength    Maximum characters per message before truncation (default 200)
 */
export function summarizeConversation(
  messages: RawMessage[],
  maxMessages = 10,
  maxLength = 200,
): string {
  if (messages.length === 0) return 'No conversation history yet.';

  return messages
    .slice(-maxMessages)
    .map((msg) => {
      const label =
        msg.role === 'user'
          ? 'User'
          : msg.role === 'assistant'
            ? 'Agent'
            : 'System';
      const body =
        msg.content.length > maxLength
          ? msg.content.slice(0, maxLength) + '…'
          : msg.content;
      return `[${label}] ${body}`;
    })
    .join('\n');
}

