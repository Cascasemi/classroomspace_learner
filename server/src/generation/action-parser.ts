/**
 * Action Parser — converts structured JSON Array LLM output into typed Action objects.
 *
 * Expected LLM output format:
 *   [
 *     { "type": "text",   "content": "spoken words..." },
 *     { "type": "action", "name": "wb_draw_text", "params": { "x": 100, ... } }
 *   ]
 *
 * Text items become `speech` actions; action items map to their respective types.
 * Original interleaving order is always preserved.
 */

import { randomUUID } from 'crypto';
import { jsonrepair } from 'jsonrepair';

// ==================== Action Types (server-side mirrors of frontend) ====================

export type ActionType =
  | 'spotlight'
  | 'laser'
  | 'speech'
  | 'play_video'
  | 'wb_open'
  | 'wb_draw_text'
  | 'wb_draw_shape'
  | 'wb_draw_chart'
  | 'wb_draw_latex'
  | 'wb_draw_table'
  | 'wb_draw_line'
  | 'wb_clear'
  | 'wb_delete'
  | 'wb_close'
  | 'discussion';

export interface ActionBase {
  id: string;
  type: ActionType;
  title?: string;
}

export type Action = ActionBase & Record<string, unknown>;

/** Actions that only make sense on slide scenes. */
export const SLIDE_ONLY_ACTIONS: ActionType[] = ['spotlight', 'laser'];

/** Actions that must complete before the next one runs. */
export const SYNC_ACTIONS: ActionType[] = [
  'speech', 'play_video',
  'wb_open', 'wb_draw_text', 'wb_draw_shape', 'wb_draw_chart',
  'wb_draw_latex', 'wb_draw_table', 'wb_draw_line',
  'wb_clear', 'wb_delete', 'wb_close',
  'discussion',
];

// ==================== Internal helpers ====================

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '');
}

/** Safely parse JSON with jsonrepair fallback. */
function safeParseArray(jsonStr: string): unknown[] | null {
  // Attempt 1: direct
  try { return JSON.parse(jsonStr) as unknown[]; } catch { /* continue */ }
  // Attempt 2: jsonrepair
  try { return JSON.parse(jsonrepair(jsonStr)) as unknown[]; } catch { /* continue */ }
  // Attempt 3: trailing-comma + truncation fix
  try {
    let fixed = jsonStr.replace(/,\s*([\]}])/g, '$1');
    const t = fixed.trim();
    if (t.startsWith('[') && !t.endsWith(']')) {
      const last = fixed.lastIndexOf('}');
      if (last > 0) fixed = fixed.substring(0, last + 1) + ']';
    }
    return JSON.parse(fixed) as unknown[];
  } catch { return null; }
}

// ==================== Public API ====================

/**
 * Parse a complete LLM response in JSON Array format into an ordered Action[].
 *
 * @param response   Raw LLM response string
 * @param sceneType  Optional scope ('slide'|'quiz'|'interactive'|'pbl') for post-filtering
 * @param allowedActions  Optional whitelist to strip hallucinated actions
 */
export function parseActionsFromStructuredOutput(
  response: string,
  sceneType?: string,
  allowedActions?: string[],
): Action[] {
  // Step 1: strip any markdown fences
  const cleaned = stripCodeFences(response.trim());

  // Step 2: find the JSON array span
  const startIdx = cleaned.indexOf('[');
  const endIdx   = cleaned.lastIndexOf(']');
  if (startIdx === -1) {
    console.warn('[action-parser] No JSON array found in response');
    return [];
  }

  const jsonStr = endIdx > startIdx
    ? cleaned.slice(startIdx, endIdx + 1)
    : cleaned.slice(startIdx); // unclosed array — let safeParseArray handle it

  // Step 3: parse
  const items = safeParseArray(jsonStr);
  if (!Array.isArray(items)) {
    console.warn('[action-parser] Parsed result is not an array');
    return [];
  }

  // Step 4: convert items → Action[]
  const actions: Action[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object' || !('type' in item)) continue;
    const it = item as Record<string, unknown>;

    if (it.type === 'text') {
      const text = ((it.content as string) || '').trim();
      if (text) {
        actions.push({ id: randomUUID(), type: 'speech', text });
      }
    } else if (it.type === 'action') {
      try {
        const actionName = (it.name ?? it.tool_name) as ActionType;
        const params = (it.params ?? it.parameters ?? {}) as Record<string, unknown>;
        actions.push({
          id: ((it.action_id ?? it.tool_id) as string) || randomUUID(),
          type: actionName,
          ...params,
        } as Action);
      } catch {
        console.warn('[action-parser] Invalid action item, skipping:', JSON.stringify(it).slice(0, 100));
      }
    }
  }

  // Step 5: discussion must be last (at most one)
  const discIdx = actions.findIndex((a) => a.type === 'discussion');
  if (discIdx !== -1 && discIdx < actions.length - 1) {
    actions.splice(discIdx + 1);
  }

  // Step 6: filter slide-only actions for non-slide scenes
  let result = actions;
  if (sceneType && sceneType !== 'slide') {
    const before = result.length;
    result = result.filter((a) => !SLIDE_ONLY_ACTIONS.includes(a.type));
    if (result.length < before) {
      console.info(`[action-parser] Stripped ${before - result.length} slide-only actions from ${sceneType} scene`);
    }
  }

  // Step 7: apply allowedActions whitelist
  if (allowedActions && allowedActions.length > 0) {
    const before = result.length;
    result = result.filter((a) => a.type === 'speech' || allowedActions.includes(a.type));
    if (result.length < before) {
      console.info(`[action-parser] Stripped ${before - result.length} disallowed actions`);
    }
  }

  return result;
}

/**
 * Convenience: extract only the speech text from a structured response,
 * concatenating all text items in order.
 */
export function extractSpeechFromStructuredOutput(response: string): string {
  const actions = parseActionsFromStructuredOutput(response);
  return actions
    .filter((a) => a.type === 'speech')
    .map((a) => (a as Action & { text: string }).text)
    .join(' ')
    .trim();
}
