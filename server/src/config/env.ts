import dotenv from 'dotenv';
dotenv.config();

export const env = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/neurospace',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:8080',

  // ─── Legacy / fallback single-model config ───────────────────────────────
  // Used when neither GEMINI_API_KEY nor OPENAI_API_KEY is set, or for
  // self-hosted / custom providers via LLM_BASE_URL override.
  LLM_API_KEY: process.env.LLM_API_KEY || '',
  LLM_BASE_URL: process.env.LLM_BASE_URL || '',
  LLM_MODEL: process.env.LLM_MODEL || '',

  // ─── Gemini (free-tier default + premium option) ─────────────────────────
  // Get key from https://aistudio.google.com/app/apikey
  // The Gemini API exposes an OpenAI-compatible /v1β/openai endpoint.
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_BASE_URL: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
  GEMINI_DEFAULT_MODEL: process.env.GEMINI_DEFAULT_MODEL || 'gemini-2.0-flash',
  // Dedicated Gemini image-generation config (native Gemini image API).
  GEMINI_IMAGE_API_KEY: process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY || '',
  GEMINI_IMAGE_BASE_URL: process.env.GEMINI_IMAGE_BASE_URL || 'https://generativelanguage.googleapis.com',
  GEMINI_IMAGE_MODEL: process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview',

  // ─── OpenAI ──────────────────────────────────────────────────────────────
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',

  // ─── Anthropic / Claude ──────────────────────────────────────────────────
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',

  // ─── DeepSeek ────────────────────────────────────────────────────────────
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',

  // ─── Groq ────────────────────────────────────────────────────────────────
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  GROQ_BASE_URL: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',

  // ─── Grok / xAI ──────────────────────────────────────────────────────────
  GROK_API_KEY: process.env.GROK_API_KEY || '',
  GROK_BASE_URL: process.env.GROK_BASE_URL || 'https://api.x.ai/v1',
  GROK_IMAGE_API_KEY: process.env.GROK_IMAGE_API_KEY || process.env.GROK_API_KEY || '',
  GROK_IMAGE_BASE_URL: process.env.GROK_IMAGE_BASE_URL || process.env.GROK_BASE_URL || 'https://api.x.ai/v1',
  GROK_IMAGE_MODEL: process.env.GROK_IMAGE_MODEL || 'grok-2-aurora',

  // ─── Qwen / Alibaba DashScope ─────────────────────────────────────────────
  QWEN_API_KEY: process.env.QWEN_API_KEY || '',
  QWEN_BASE_URL: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  QWEN_IMAGE_API_KEY: process.env.QWEN_IMAGE_API_KEY || process.env.QWEN_API_KEY || '',
  QWEN_IMAGE_BASE_URL: process.env.QWEN_IMAGE_BASE_URL || 'https://dashscope.aliyuncs.com',
  QWEN_IMAGE_MODEL: process.env.QWEN_IMAGE_MODEL || 'wanx2.5-t2i-turbo',

  // ─── ElevenLabs TTS ───────────────────────────────────────────────────────
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '',

  // ─── OpenAI Whisper ASR ──────────────────────────────────────────────────
  OPENAI_WHISPER_URL: process.env.OPENAI_WHISPER_URL || 'https://api.openai.com/v1/audio/transcriptions',

  // Subscription gate — set to "false" to disable premium checks in dev
  REQUIRE_PREMIUM: process.env.REQUIRE_PREMIUM !== 'false',
} as const;

// ─── Provider availability ───────────────────────────────────────────────────
// Returns true if the admin has configured an API key for this provider.
// Models whose provider returns false appear as "Coming Soon" in the UI.
// All provider IDs across LLM, image, video, TTS, ASR.
// 'browser' = built-in browser API, always available (no key needed).
export type ProviderId =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'groq'
  | 'grok'
  | 'qwen'
  | 'elevenlabs'
  | 'browser';

export function isProviderConfigured(provider: ProviderId): boolean {
  switch (provider) {
    case 'gemini':     return !!(env.GEMINI_API_KEY || env.GEMINI_IMAGE_API_KEY);
    case 'openai':     return !!env.OPENAI_API_KEY;
    case 'anthropic':  return !!env.ANTHROPIC_API_KEY;
    case 'deepseek':   return !!env.DEEPSEEK_API_KEY;
    case 'groq':       return !!env.GROQ_API_KEY;
    case 'grok':       return !!(env.GROK_API_KEY || env.GROK_IMAGE_API_KEY);
    case 'qwen':       return !!(env.QWEN_API_KEY || env.QWEN_IMAGE_API_KEY);
    case 'elevenlabs': return !!env.ELEVENLABS_API_KEY;
    case 'browser':    return true; // built-in, no key needed
    default:           return false;
  }
}

// ─── Model catalogue ────────────────────────────────────────────────────────
export type ModelId =
  // Gemini
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro'
  | 'gemini-2.0-flash'
  // OpenAI
  | 'gpt-4o-mini'
  | 'gpt-4o'
  | 'gpt-4.1'
  | 'o4-mini'
  // Anthropic
  | 'claude-3-5-haiku-20241022'
  | 'claude-3-7-sonnet-20250219'
  | 'claude-opus-4-5'
  // DeepSeek
  | 'deepseek-chat'
  | 'deepseek-reasoner'
  // Groq
  | 'llama-3.3-70b-versatile'
  | 'gemma2-9b-it'
  // Grok / xAI
  | 'grok-3'
  | 'grok-3-mini'
  | 'grok-3-fast'
  // Qwen
  | 'qwen-max'
  | 'qwen-plus'
  | 'qwen-turbo';

export interface ModelEntry {
  id: ModelId;
  label: string;
  description: string;
  provider: ProviderId;
  tier: 'free' | 'premium';
}

export const MODEL_CATALOGUE: ModelEntry[] = [
  // ── Gemini ──────────────────────────────────────────────────────────────
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: 'Latest Google model — fast and multimodal',
    provider: 'gemini',
    tier: 'free',
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: 'Most capable Gemini — deep reasoning + long context',
    provider: 'gemini',
    tier: 'premium',
  },
  {
    id: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    description: 'Reliable Gemini — proven performance',
    provider: 'gemini',
    tier: 'free',
  },
  // ── OpenAI ──────────────────────────────────────────────────────────────
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    description: 'OpenAI — efficient and fast',
    provider: 'openai',
    tier: 'premium',
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    description: 'OpenAI flagship — vision + advanced reasoning',
    provider: 'openai',
    tier: 'premium',
  },
  {
    id: 'gpt-4.1',
    label: 'GPT-4.1',
    description: 'OpenAI — latest generation, stronger coding & instruction following',
    provider: 'openai',
    tier: 'premium',
  },
  {
    id: 'o4-mini',
    label: 'o4 Mini',
    description: 'OpenAI reasoning model — chain-of-thought problem solving',
    provider: 'openai',
    tier: 'premium',
  },
  // ── Anthropic / Claude ──────────────────────────────────────────────────
  {
    id: 'claude-3-5-haiku-20241022',
    label: 'Claude 3.5 Haiku',
    description: 'Anthropic — fastest Claude, great for real-time tasks',
    provider: 'anthropic',
    tier: 'premium',
  },
  {
    id: 'claude-3-7-sonnet-20250219',
    label: 'Claude 3.7 Sonnet',
    description: 'Anthropic — balanced performance and intelligence',
    provider: 'anthropic',
    tier: 'premium',
  },
  {
    id: 'claude-opus-4-5',
    label: 'Claude Opus 4.5',
    description: 'Anthropic — most intelligent for complex tasks',
    provider: 'anthropic',
    tier: 'premium',
  },
  // ── DeepSeek ────────────────────────────────────────────────────────────
  {
    id: 'deepseek-chat',
    label: 'DeepSeek V3',
    description: 'DeepSeek — high-performance open-source model',
    provider: 'deepseek',
    tier: 'premium',
  },
  {
    id: 'deepseek-reasoner',
    label: 'DeepSeek R1',
    description: 'DeepSeek — advanced chain-of-thought reasoning',
    provider: 'deepseek',
    tier: 'premium',
  },
  // ── Groq ────────────────────────────────────────────────────────────────
  {
    id: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B',
    description: 'Meta via Groq — ultra-fast open-source LLM',
    provider: 'groq',
    tier: 'premium',
  },
  {
    id: 'gemma2-9b-it',
    label: 'Gemma 2 9B',
    description: 'Google via Groq — lightweight and fast',
    provider: 'groq',
    tier: 'premium',
  },
  // ── Grok / xAI ──────────────────────────────────────────────────────────
  {
    id: 'grok-3',
    label: 'Grok 3',
    description: 'xAI — powerful reasoning and knowledge',
    provider: 'grok',
    tier: 'premium',
  },
  {
    id: 'grok-3-mini',
    label: 'Grok 3 Mini',
    description: 'xAI — fast and efficient',
    provider: 'grok',
    tier: 'premium',
  },
  {
    id: 'grok-3-fast',
    label: 'Grok 3 Fast',
    description: 'xAI — optimised for low latency',
    provider: 'grok',
    tier: 'premium',
  },
  // ── Qwen ────────────────────────────────────────────────────────────────
  {
    id: 'qwen-max',
    label: 'Qwen Max',
    description: 'Alibaba — top-tier Qwen, strong reasoning',
    provider: 'qwen',
    tier: 'premium',
  },
  {
    id: 'qwen-plus',
    label: 'Qwen Plus',
    description: 'Alibaba — balanced capability and speed',
    provider: 'qwen',
    tier: 'premium',
  },
  {
    id: 'qwen-turbo',
    label: 'Qwen Turbo',
    description: 'Alibaba — lightest and fastest Qwen',
    provider: 'qwen',
    tier: 'premium',
  },
];

// ─── Image generation catalogue ─────────────────────────────────────────────
export type ImageModelId =
  | 'gemini-2.5-flash-image'
  | 'wanx2.5-t2i-turbo'
  | 'grok-2-aurora';

export interface MediaEntry {
  id: string;
  label: string;
  description: string;
  provider: ProviderId;
}

export const IMAGE_CATALOGUE: MediaEntry[] = [
  {
    id: 'gemini-3.1-flash-image-preview',
    label: 'Gemini Image (Nano Banana 2)',
    description: 'Google Gemini 3.1 Flash — native image generation',
    provider: 'gemini',
  },
  {
    id: 'wanx2.5-t2i-turbo',
    label: 'Qwen Image',
    description: 'Alibaba Wanx — text-to-image generation',
    provider: 'qwen',
  },
  {
    id: 'grok-2-aurora',
    label: 'Grok Image (Aurora)',
    description: 'xAI Aurora — high-quality image generation',
    provider: 'grok',
  },
];

// ─── Video generation catalogue ─────────────────────────────────────────────
export const VIDEO_CATALOGUE: MediaEntry[] = [
  {
    id: 'veo-2.0-generate-001',
    label: 'Veo 2',
    description: 'Google Veo 2 — cinematic video generation',
    provider: 'gemini',
  },
  {
    id: 'grok-video',
    label: 'Grok Video',
    description: 'xAI — video generation model',
    provider: 'grok',
  },
  {
    id: 'sora-1.0',
    label: 'Sora',
    description: 'OpenAI Sora — text-to-video generation',
    provider: 'openai',
  },
];

// ─── TTS catalogue ──────────────────────────────────────────────────────────
export const TTS_CATALOGUE: MediaEntry[] = [
  {
    id: 'gpt-4o-mini-tts',
    label: 'OpenAI TTS',
    description: 'OpenAI natural text-to-speech',
    provider: 'openai',
  },
  {
    id: 'eleven_multilingual_v2',
    label: 'ElevenLabs TTS',
    description: 'ElevenLabs — ultra-realistic AI voices',
    provider: 'elevenlabs',
  },
  {
    id: 'cosyvoice-v2',
    label: 'Qwen TTS',
    description: 'Alibaba CosyVoice — multilingual natural speech',
    provider: 'qwen',
  },
  {
    id: 'browser-native-tts',
    label: 'Browser Native',
    description: 'Built-in browser speech synthesis — no API key needed',
    provider: 'browser',
  },
];

// ─── ASR catalogue ──────────────────────────────────────────────────────────
export const ASR_CATALOGUE: MediaEntry[] = [
  {
    id: 'gpt-4o-mini-transcribe',
    label: 'OpenAI ASR',
    description: 'OpenAI — accurate speech recognition',
    provider: 'openai',
  },
  {
    id: 'paraformer-realtime-v2',
    label: 'Qwen ASR',
    description: 'Alibaba Paraformer — real-time speech recognition',
    provider: 'qwen',
  },
  {
    id: 'browser-native-asr',
    label: 'Browser Native',
    description: 'Built-in browser speech recognition — no API key needed',
    provider: 'browser',
  },
];
