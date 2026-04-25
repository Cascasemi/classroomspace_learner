/**
 * DirectorEngine — Lightweight multi-agent turn coordinator
 *
 * Replaces the hardcoded `rolePriority` for-loop in discuss.ts, ask.ts,
 * and discussion-room.ts with a single engine that:
 *
 *   1. Decides which agent speaks next (or when to hand control back to
 *      the student via a `cue_user` decision).
 *   2. Gates whiteboard tool access per agent per round so student-role
 *      agents never receive draw actions unless explicitly configured.
 *   3. Accumulates an in-request whiteboard ledger and peer-turn summaries
 *      that are fed as context to every subsequent agent in the same round.
 *
 * Design principles:
 *   – Stateless across HTTP requests: one engine instance per request.
 *   – No LangGraph, no external dependencies — plain TypeScript.
 *   – LLM-based director decisions are a future extension point; the
 *     interface (`decide() → DirectorDecision`) supports them without
 *     touching callers. The current implementation is pure rule-based.
 *   – The AICallFn parameter is accepted but currently unused; reserved
 *     for when LLM-based "who speaks next?" is added.
 */

import type { AgentTurnSummary, WBLedgerRecord } from './agent-prompt-builder.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal agent descriptor.  Mirrors the AgentConfig interface that each
 * route declares locally — defined here once so callers can import it and
 * use it as the canonical shape.
 */
export interface DirectorAgent {
  id: string;
  name: string;
  /** 'teacher' | 'assistant' | 'student' | any custom role string */
  role: string;
  persona?: string;
}

/**
 * Which call-site created this DirectorEngine.
 * Drives default turn limits, role eligibility, and terminal behaviour.
 */
export type DirectorMode =
  | 'discuss'      // mid-lecture discussion break       /api/discuss
  | 'ask'          // student mid-lecture question        /api/ask
  | 'room-intro'   // teacher opens a discussion room     /api/discussion-room (mode:'intro')
  | 'room-turn';   // peer turn in a discussion room      /api/discussion-room (mode:'turn')

/**
 * Constructor config — immutable after construction.
 */
export interface DirectorConfig {
  /** All agents eligible for this round (already filtered by the route). */
  agents: DirectorAgent[];

  /** The topic / question being addressed this round. */
  topic: string;

  /** Which call-site created this engine. */
  mode: DirectorMode;

  /**
   * Hard ceiling on agent turns per request.
   *
   * Defaults by mode:
   *   ask          — agents.length  (every agent answers once)
   *   discuss      — agents.length  (every agent speaks once, then cue_user)
   *   room-intro   — 1              (teacher only)
   *   room-turn    — agents.length  (all non-teacher agents, then cue_user)
   */
  maxTurns?: number;

  /**
   * When set, this agent is dispatched on turn 0 instead of role-sort.
   * Used by room-intro to guarantee the teacher introduces the topic.
   */
  triggerAgentId?: string;

  /** Passed into prompt builders for personalised teaching. */
  userProfile?: { nickname?: string; bio?: string };

  /**
   * Pre-seeded whiteboard ledger from a previous request.
   * Per the current decision: always pass [] — the ledger is per-request.
   * Field kept for future cross-request persistence.
   */
  initialWbLedger?: WBLedgerRecord[];
}

/**
 * Mutable state — updated by `recordTurn()` after each agent completes.
 * Read-only from outside via `getState()`.
 */
export interface DirectorState {
  /** Total agent turns fired so far in this request. */
  turnCount: number;

  /** Agent IDs that have already spoken this round. */
  spokenThisRound: Set<string>;

  /** Ordered peer-context summaries (fed to every subsequent agent). */
  agentResponses: AgentTurnSummary[];

  /**
   * Cumulative whiteboard ledger for this round.
   * Every wb_draw_*, wb_clear, and wb_delete event is appended here as
   * agents complete their turns.  The next agent's prompt builder reads
   * this to learn what is already on the canvas.
   */
  wbLedger: WBLedgerRecord[];
}

/**
 * Result of `decide()` — what should happen next.
 */
export type DirectorDecision =
  /**
   * Dispatch the named agent.
   * `allowedWbActions` is the exact set of wb_* action names the route
   * should pass into the agent's prompt builder.  Everything outside this
   * list is omitted from the whiteboard catalogue.
   */
  | { action: 'speak'; agentId: string; allowedWbActions: string[] }

  /**
   * Round complete — hand control back to the student.
   * `fromAgentId` is the last agent who spoke (for UI avatar highlighting).
   * Route emits `{ type: 'cue_user', fromAgentId }` then calls `res.end()`.
   */
  | { action: 'cue_user'; fromAgentId: string | null }

  /**
   * Round complete — terminate without expecting a student follow-up.
   * Used by `ask` and `room-intro` where playback resumes automatically.
   */
  | { action: 'end' };

/**
 * AI call function — signature returned by `createAICallFnForUser`.
 * Accepted by the constructor; reserved for future LLM-based director
 * decisions.  Currently unused.
 */
export type AICallFn = (systemPrompt: string, userPrompt: string) => Promise<string>;

// ─────────────────────────────────────────────────────────────────────────────
// Whiteboard action grants per role
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full ordered list of whiteboard action names, matching the keys used in the
 * WB_ACTION_CATALOGUE section of agent-prompt-builder.ts.
 */
const ALL_WB_ACTIONS = [
  'wb_open',
  'wb_close',
  'wb_clear',
  'wb_delete',
  'wb_draw_text',
  'wb_draw_shape',
  'wb_draw_chart',
  'wb_draw_latex',
  'wb_draw_table',
  'wb_draw_line',
] as const;

type WbActionName = (typeof ALL_WB_ACTIONS)[number];

/**
 * Per-role whiteboard action grants.
 *
 * teacher    — full access: create, clear, delete, every draw type
 * assistant  — additive only: open + draw text / latex / table (no clear/delete)
 * student    — none by default (teacher may invite in a future extension)
 * unknown    — safe default: none
 *
 * This is the single source of truth.  `getAllowedWbActions()` reads from
 * here; the prompt builder only advertises actions in the returned list.
 */
const WB_GRANTS: Record<string, readonly WbActionName[]> = {
  teacher: ALL_WB_ACTIONS,

  assistant: [
    'wb_open',
    'wb_draw_text',
    'wb_draw_shape',
    'wb_draw_latex',
    'wb_draw_table',
  ],

  student: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Role ordering — lower number → speaks earlier
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_PRIORITY: Record<string, number> = {
  teacher:   0,
  assistant: 1,
  student:   2,
};

function rolePriority(role: string): number {
  return ROLE_PRIORITY[role] ?? 99;
}

// ─────────────────────────────────────────────────────────────────────────────
// DirectorEngine
// ─────────────────────────────────────────────────────────────────────────────

export class DirectorEngine {
  readonly config: DirectorConfig;

  // Reserved for future LLM-based director decisions.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly _callAI: AICallFn;

  private state: DirectorState;

  /** Resolved max turns (after applying mode defaults). */
  private readonly maxTurns: number;

  /** Agents sorted by role priority, pre-computed once. */
  private readonly sortedAgents: DirectorAgent[];

  /**
   * Agents eligible on the first turn of room-turn mode (non-teacher only).
   * In all other modes this is identical to `sortedAgents`.
   */
  private readonly eligibleAgents: DirectorAgent[];

  constructor(config: DirectorConfig, callAI: AICallFn) {
    this.config   = config;
    this._callAI  = callAI;

    // Sort agents by role priority once.
    this.sortedAgents = [...config.agents].sort(
      (a, b) => rolePriority(a.role) - rolePriority(b.role),
    );

    // room-turn: teacher has stepped back — only assistant + student participate.
    this.eligibleAgents =
      config.mode === 'room-turn'
        ? this.sortedAgents.filter((a) => a.role !== 'teacher')
        : this.sortedAgents;

    // Apply mode-specific default for maxTurns.
    this.maxTurns =
      config.maxTurns ??
      (config.mode === 'room-intro' ? 1 : this.eligibleAgents.length);

    this.state = {
      turnCount:       0,
      spokenThisRound: new Set<string>(),
      agentResponses:  [],
      wbLedger:        [...(config.initialWbLedger ?? [])],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Decide the next step.
   *
   * Called at the start of every loop iteration in the route.  Returns one of:
   *   'speak'    → dispatch the named agent
   *   'cue_user' → emit cue_user SSE event and close the stream
   *   'end'      → close the stream silently
   *
   * Current strategy: pure rule-based.
   *
   * Turn 0 with triggerAgentId set → always dispatch that agent first.
   * After that → iterate eligibleAgents in priority order, skipping agents
   * that have already spoken this round.
   * When all eligible agents have spoken, or turnCount ≥ maxTurns:
   *   discuss / room-turn → cue_user
   *   ask / room-intro    → end
   */
  decide(): DirectorDecision {
    const { turnCount, spokenThisRound } = this.state;

    // ── Hard turn ceiling ──────────────────────────────────────────────────
    if (turnCount >= this.maxTurns) {
      return this.terminalDecision();
    }

    // ── Turn 0 trigger ─────────────────────────────────────────────────────
    if (turnCount === 0 && this.config.triggerAgentId) {
      const trigger = this.eligibleAgents.find(
        (a) => a.id === this.config.triggerAgentId,
      );
      if (trigger) {
        return {
          action:          'speak',
          agentId:         trigger.id,
          allowedWbActions: this.getAllowedWbActions(trigger.id),
        };
      }
      // triggerAgentId not in eligible list — fall through to normal ordering
    }

    // ── Next unspoken agent in priority order ──────────────────────────────
    const next = this.eligibleAgents.find((a) => !spokenThisRound.has(a.id));

    if (!next) {
      // All eligible agents have spoken — end the round.
      return this.terminalDecision();
    }

    return {
      action:           'speak',
      agentId:          next.id,
      allowedWbActions: this.getAllowedWbActions(next.id),
    };
  }

  /**
   * Record a completed agent turn.
   *
   * Must be called after the agent's response has been streamed to the
   * client, before the next call to `decide()`.
   *
   * @param summary       Peer-context summary (appended to `agentResponses`).
   * @param wbActions     Whiteboard actions emitted by this agent (appended
   *                      to `wbLedger` so later agents see virtual canvas state).
   */
  recordTurn(
    summary: AgentTurnSummary,
    wbActions: Array<{ name: string; params?: Record<string, unknown> }>,
  ): void {
    this.state.turnCount += 1;
    this.state.spokenThisRound.add(summary.agentId);
    this.state.agentResponses.push(summary);

    // Only content-producing actions go into the ledger (not wb_open/wb_close).
    const ledgerActions = wbActions.filter(
      (a) => a.name !== 'wb_open' && a.name !== 'wb_close',
    );
    const agentName = summary.agentName;
    for (const act of ledgerActions) {
      this.state.wbLedger.push({
        agentName,
        actionName: act.name,
        params:     act.params ?? {},
      });
    }
  }

  /**
   * Returns the allowed wb_* action names for a given agent.
   * The route passes this list to the prompt builder; actions outside the
   * list are omitted from the WB_ACTION_CATALOGUE section.
   *
   * Resolution order:
   *   1. Look up agent's role in WB_GRANTS.
   *   2. If the role is unknown, return [] (safe default).
   */
  getAllowedWbActions(agentId: string): string[] {
    const agent = this.config.agents.find((a) => a.id === agentId);
    if (!agent) return [];
    const grants = WB_GRANTS[agent.role];
    return grants ? [...grants] : [];
  }

  /**
   * Returns a read-only snapshot of the current state.
   * `spokenThisRound` is serialised as a string[] for easy logging.
   */
  getState(): Readonly<Omit<DirectorState, 'spokenThisRound'> & { spokenThisRound: string[] }> {
    return {
      turnCount:       this.state.turnCount,
      spokenThisRound: [...this.state.spokenThisRound],
      agentResponses:  this.state.agentResponses,
      wbLedger:        this.state.wbLedger,
    };
  }

  /**
   * Convenience accessor — returns the accumulated wbLedger.
   * Used by routes to pass the ledger into `buildDiscussionSystemPrompt`.
   */
  getWbLedger(): WBLedgerRecord[] {
    return this.state.wbLedger;
  }

  /**
   * Convenience accessor — returns the accumulated peer-turn summaries.
   * Used by routes to pass context into subsequent agents' prompts.
   */
  getAgentResponses(): AgentTurnSummary[] {
    return this.state.agentResponses;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build the terminal decision based on mode:
   *   discuss / room-turn → cue_user (student drives next message)
   *   ask / room-intro    → end      (playback resumes automatically)
   */
  private terminalDecision(): DirectorDecision {
    const shouldCueUser =
      this.config.mode === 'discuss' || this.config.mode === 'room-turn';

    if (shouldCueUser) {
      const lastSpeaker = this.state.agentResponses.at(-1) ?? null;
      return {
        action:      'cue_user',
        fromAgentId: lastSpeaker?.agentId ?? null,
      };
    }

    return { action: 'end' };
  }
}
