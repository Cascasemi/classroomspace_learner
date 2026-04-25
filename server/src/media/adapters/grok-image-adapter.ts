import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types.js';

const DEFAULT_BASE_URL = 'https://api.x.ai/v1';
const DEFAULT_MODEL = 'grok-2-aurora';

export async function generateWithGrokImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;

  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_MODEL,
      prompt: options.prompt,
      n: 1,
      response_format: 'url',
    }),
  });

  if (!response.ok) {
    throw new Error(`Grok image generation failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json() as { data?: Array<{ url?: string; b64_json?: string }> };
  const imageData = data.data?.[0];
  if (!imageData?.url && !imageData?.b64_json) {
    throw new Error('Grok returned empty image response');
  }

  return {
    url: imageData.url,
    base64: imageData.b64_json,
    width: options.width || 1280,
    height: options.height || 720,
  };
}
