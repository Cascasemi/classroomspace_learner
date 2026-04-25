import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types.js';

const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com';
const DEFAULT_MODEL = 'wanx2.5-t2i-turbo';

function resolveSize(options: ImageGenerationOptions): string {
  const w = options.width || 1280;
  const h = options.height || 720;
  return `${w}*${h}`;
}

export async function generateWithQwenImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const response = await fetch(`${baseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_MODEL,
      input: {
        messages: [
          { role: 'user', content: [{ text: options.prompt }] },
        ],
      },
      parameters: {
        negative_prompt: options.negativePrompt || undefined,
        prompt_extend: true,
        watermark: false,
        size: resolveSize(options),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Qwen image generation failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json() as {
    output?: { choices?: Array<{ message?: { content?: Array<{ image?: string }> } }> };
    code?: string;
    message?: string;
  };

  const imageUrl = data.output?.choices?.[0]?.message?.content?.find((c) => c.image)?.image;
  if (!imageUrl) {
    throw new Error(`Qwen image generation returned no image${data.message ? `: ${data.message}` : ''}`);
  }

  return {
    url: imageUrl,
    width: options.width || 1280,
    height: options.height || 720,
  };
}
