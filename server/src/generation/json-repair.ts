/**
 * JSON Repair — robust parsing of LLM JSON output.
 *
 * Strategies in order:
 *   1. Extract from markdown code-block(s) and try each
 *   2. Find JSON array/object via bracket-tracking, then parse
 *   3. Last-resort: try entire trimmed response
 *
 * tryParseJson runs up to 4 internal fix passes:
 *   A. LaTeX-escape + trailing-comma + truncation fix → JSON.parse
 *   B. jsonrepair library
 *   C. Control-character stripping → JSON.parse
 */

import { jsonrepair } from 'jsonrepair';

// ==================== Internal helper ====================

/**
 * Attempt to parse (and auto-repair) a single JSON string candidate.
 * Returns null if every strategy fails.
 */
function tryParseJson<T>(jsonStr: string): T | null {
  // Attempt 1: parse as-is
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    // continue
  }

  // Attempt 2: common AI-output fixes
  try {
    let fixed = jsonStr;

    // Fix LaTeX backslash commands inside JSON strings
    // e.g. "\frac" → "\\frac" but keep \b \f \n \r \t \u intact
    fixed = fixed.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (_match: string, content: string) => {
      const fixedContent = content.replace(/\\([a-zA-Z])/g, (_m: string, ch: string) => {
        if ('bfnrtu'.includes(ch)) return `\\${ch}`;
        return `\\\\${ch}`;
      });
      return `"${fixedContent}"`;
    });

    // Remove trailing commas before ] or }
    fixed = fixed.replace(/,\s*([\]}])/g, '$1');

    // Recover truncated JSON array
    const t = fixed.trim();
    if (t.startsWith('[') && !t.endsWith(']')) {
      const last = fixed.lastIndexOf('}');
      if (last > 0) fixed = fixed.substring(0, last + 1) + ']';
    } else if (t.startsWith('{') && !t.endsWith('}')) {
      const opens  = (fixed.match(/{/g) || []).length;
      const closes = (fixed.match(/}/g) || []).length;
      if (opens > closes) fixed += '}'.repeat(opens - closes);
    }

    return JSON.parse(fixed) as T;
  } catch {
    // continue
  }

  // Attempt 3: jsonrepair library
  try {
    return JSON.parse(jsonrepair(jsonStr)) as T;
  } catch {
    // continue
  }

  // Attempt 4: strip control characters then parse
  try {
    const fixed = jsonStr.replace(/[\x00-\x1F\x7F]/g, (ch) => {
      switch (ch) {
        case '\n': return '\\n';
        case '\r': return '\\r';
        case '\t': return '\\t';
        default:   return '';
      }
    });
    return JSON.parse(fixed) as T;
  } catch {
    return null;
  }
}

// ==================== Public API ====================

/**
 * Parse an LLM JSON response using multiple fallback strategies.
 */
export function parseJsonResponse<T>(response: string): T | null {
  // Strategy 1: try every markdown code block
  for (const match of response.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) {
    const extracted = match[1].trim();
    if (extracted.startsWith('{') || extracted.startsWith('[')) {
      const result = tryParseJson<T>(extracted);
      if (result !== null) return result;
    }
  }

  // Strategy 2: bracket-tracking to find the JSON structure
  const arrStart = response.indexOf('[');
  const objStart = response.indexOf('{');

  if (arrStart !== -1 || objStart !== -1) {
    const startIndex =
      arrStart === -1 ? objStart
      : objStart === -1 ? arrStart
      : Math.min(arrStart, objStart);

    let depth = 0;
    let endIndex = -1;
    let inString = false;
    let escNext = false;

    for (let i = startIndex; i < response.length; i++) {
      const ch = response[i];
      if (escNext) { escNext = false; continue; }
      if (ch === '\\' && inString) { escNext = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (!inString) {
        if (ch === '[' || ch === '{') depth++;
        else if (ch === ']' || ch === '}') {
          depth--;
          if (depth === 0) { endIndex = i; break; }
        }
      }
    }

    if (endIndex !== -1) {
      const result = tryParseJson<T>(response.substring(startIndex, endIndex + 1));
      if (result !== null) return result;
    }
  }

  // Strategy 3: last resort — try the trimmed whole response
  const result = tryParseJson<T>(response.trim());
  if (result === null) {
    console.error('[json-repair] All strategies failed. First 300 chars:', response.slice(0, 300));
  }
  return result;
}
