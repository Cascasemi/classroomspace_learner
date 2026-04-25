export type ImageProviderId = 'nano-banana' | 'qwen-image' | 'grok-image';

export interface ImageGenerationConfig {
  providerId: ImageProviderId;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export interface ImageGenerationOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  aspectRatio?: '16:9' | '4:3' | '1:1' | '9:16';
  style?: string;
}

export interface ImageGenerationResult {
  url?: string;
  base64?: string;
  bytes?: Buffer;
  width: number;
  height: number;
}
