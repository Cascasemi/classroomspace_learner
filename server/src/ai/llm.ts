/**
 * LLM Integration — multi-provider, tier-aware chat completions.
 *
 * Routing rules:
 *   free tier   → Gemini 2.0 Flash via Google AI Studio OpenAI-compatible API
 *   premium tier → user's preferred model (Gemini or OpenAI family)
 *
 * All models use the OpenAI /chat/completions wire format.
 * No API keys are ever exposed to the frontend.
 */

import { env, type ProviderId } from '../config/env.js';
import { User } from '../models/User.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface ModelConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider?: ProviderId;
}

// ─── Provider resolution ──────────────────────────────────────────────────────

/**
 * Determine which API key, base URL, and model to use for a user.
 *
 * Priority:
 *   1. Free tier  → always Gemini Flash (GEMINI_API_KEY required)
 *   2. Premium    → user's preferredModel; fallback Gemini Flash if key available
 *   3. Legacy     → env.LLM_API_KEY / LLM_BASE_URL / LLM_MODEL (backward compat)
 */
export function resolveModelConfig(
  tier: 'free' | 'premium' = 'free',
  preferredModel?: string,
): ModelConfig {
  const geminiFallback: ModelConfig = {
    apiKey: env.GEMINI_API_KEY,
    baseUrl: env.GEMINI_BASE_URL,
    model: env.GEMINI_DEFAULT_MODEL,
  };
  const legacyFallback: ModelConfig = {
    apiKey: env.LLM_API_KEY,
    baseUrl: env.LLM_BASE_URL || 'https://api.openai.com/v1',
    model: env.LLM_MODEL || 'gpt-4o-mini',
  };

  // Free users always get Gemini Flash
  if (tier === 'free') {
    if (env.GEMINI_API_KEY) return geminiFallback;
    return legacyFallback;
  }

  // Premium users: route by model family
  const model = preferredModel || env.GEMINI_DEFAULT_MODEL;

  if (model.startsWith('gpt') || model.startsWith('o4') || model.startsWith('o1') || model.startsWith('o3')) {
    if (env.OPENAI_API_KEY) {
      return { apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL, model, provider: 'openai' };
    }
    console.warn('[llm] OPENAI_API_KEY not set, falling back to Gemini');
  }

  if (model.startsWith('claude')) {
    if (env.ANTHROPIC_API_KEY) {
      return { apiKey: env.ANTHROPIC_API_KEY, baseUrl: env.ANTHROPIC_BASE_URL, model, provider: 'anthropic' };
    }
    console.warn('[llm] ANTHROPIC_API_KEY not set, falling back to Gemini');
  }

  if (model.startsWith('deepseek')) {
    if (env.DEEPSEEK_API_KEY) {
      return { apiKey: env.DEEPSEEK_API_KEY, baseUrl: env.DEEPSEEK_BASE_URL, model, provider: 'deepseek' };
    }
    console.warn('[llm] DEEPSEEK_API_KEY not set, falling back to Gemini');
  }

  if (model.startsWith('grok')) {
    if (env.GROK_API_KEY) {
      return { apiKey: env.GROK_API_KEY, baseUrl: env.GROK_BASE_URL, model, provider: 'grok' };
    }
    console.warn('[llm] GROK_API_KEY not set, falling back to Gemini');
  }

  if (model.startsWith('qwen')) {
    if (env.QWEN_API_KEY) {
      return { apiKey: env.QWEN_API_KEY, baseUrl: env.QWEN_BASE_URL, model, provider: 'qwen' };
    }
    console.warn('[llm] QWEN_API_KEY not set, falling back to Gemini');
  }

  if (model.startsWith('llama') || model.startsWith('gemma') || model.startsWith('mixtral')) {
    if (env.GROQ_API_KEY) {
      return { apiKey: env.GROQ_API_KEY, baseUrl: env.GROQ_BASE_URL, model, provider: 'groq' };
    }
    console.warn('[llm] GROQ_API_KEY not set, falling back to Gemini');
  }

  // Gemini family (or fallback)
  if (env.GEMINI_API_KEY) {
    return { ...geminiFallback, model, provider: 'gemini' };
  }

  return legacyFallback;
}

// ─── Core call ────────────────────────────────────────────────────────────────

/**
/** fetch() with a hard timeout — prevents indefinite hangs on slow LLM APIs */
function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 25_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * Call an OpenAI-compatible chat completions endpoint.
 */
export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  options?: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
    /** Provide explicit provider config to bypass env resolution */
    config?: ModelConfig;
  },
): Promise<string> {
  const cfg = options?.config ?? resolveModelConfig();
  const model = options?.model ?? cfg.model;
  const { apiKey, baseUrl, provider } = cfg;

  if (!apiKey) {
    throw new Error(
      'No LLM API key configured. Set GEMINI_API_KEY (free/default) or the relevant provider key in server/.env',
    );
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  // ── Anthropic uses a different wire format ────────────────────────────────
  if (provider === 'anthropic') {
    const response = await fetchWithTimeout(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.7,
      }),
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
    }
    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const text = data.content?.find((p) => p.type === 'text')?.text;
    if (!text) throw new Error('Anthropic returned empty response');
    return text;
  }

  // ── OpenAI-compatible (OpenAI, Gemini, DeepSeek, Groq) ───────────────────
  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(`LLM API error ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;

  if (!data.choices?.[0]?.message?.content) {
    throw new Error('LLM returned empty response');
  }

  return data.choices[0].message.content;
}

// ─── Multi-turn chat ──────────────────────────────────────────────────────────

/**
 * Like callLLM but accepts a full conversation history instead of a single
 * user prompt. Used by the Synthesis Tutor for multi-turn sessions.
 */
export async function callLLMChat(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    config?: ModelConfig;
  },
): Promise<string> {
  const cfg = options?.config ?? resolveModelConfig();
  const { apiKey, baseUrl, model, provider } = cfg;

  if (!apiKey) {
    throw new Error('No LLM API key configured.');
  }

  // Anthropic uses a different wire format — extract system + conversation
  if (provider === 'anthropic') {
    const systemMsg = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');
    const response = await fetchWithTimeout(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        system: systemMsg?.content ?? '',
        messages: conversationMessages,
        max_tokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.7,
      }),
    });
    if (!response.ok) throw new Error(`Anthropic API error ${response.status}`);
    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const text = data.content?.find((p) => p.type === 'text')?.text;
    if (!text) throw new Error('Anthropic returned empty response');
    return text;
  }

  // OpenAI-compatible (OpenAI, Gemini, DeepSeek, Groq, etc.)
  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(`LLM API error ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  if (!data.choices?.[0]?.message?.content) throw new Error('LLM returned empty response');
  return data.choices[0].message.content;
}

// ─── Factory helpers ──────────────────────────────────────────────────────────

/**
 * Create a reusable AI call function using the default (free) model config.
 * Used by the pipeline when no userId is available.
 */
export function createAICallFn(options?: {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}): (systemPrompt: string, userPrompt: string) => Promise<string> {
  const cfg = resolveModelConfig('free');
  return (systemPrompt: string, userPrompt: string) =>
    callLLM(systemPrompt, userPrompt, { ...options, config: cfg });
}

/**
 * Create a per-user AI call function that respects tier and model preference.
 * Premium users get their preferred model; free users always get Gemini Flash.
 */
export async function createAICallFnForUser(
  userId: string,
  options?: { temperature?: number; maxTokens?: number },
): Promise<(systemPrompt: string, userPrompt: string) => Promise<string>> {
  let tier: 'free' | 'premium' = 'free';
  let preferredModel: string | undefined;

  try {
    const user = await User.findById(userId).select('subscription preferredModel');
    if (user) {
      tier = user.subscription;
      preferredModel = user.preferredModel;
    }
  } catch (err) {
    console.warn('[llm] Could not load user tier, defaulting to free:', err);
  }

  const cfg = resolveModelConfig(tier, preferredModel);
  console.log(`[llm] User ${userId} → ${cfg.model} (${tier})`);

  return (systemPrompt: string, userPrompt: string) =>
    callLLM(systemPrompt, userPrompt, { ...options, config: cfg });
}
/**
 * Create a per-user multi-turn chat function for the Synthesis Tutor.
 * Accepts a full ChatMessage[] so the LLM sees the complete conversation.
 */
export async function createChatFnForUser(
  userId: string,
  options?: { temperature?: number; maxTokens?: number },
): Promise<(messages: ChatMessage[]) => Promise<string>> {
  let tier: 'free' | 'premium' = 'free';
  let preferredModel: string | undefined;

  try {
    const user = await User.findById(userId).select('subscription preferredModel');
    if (user) {
      tier = user.subscription;
      preferredModel = user.preferredModel;
    }
  } catch (err) {
    console.warn('[llm] createChatFnForUser: could not load user tier:', err);
  }

  const cfg = resolveModelConfig(tier, preferredModel);
  return (messages: ChatMessage[]) => callLLMChat(messages, { ...options, config: cfg });
}

export type { ChatMessage };