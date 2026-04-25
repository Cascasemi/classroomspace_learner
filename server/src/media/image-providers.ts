import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
  ImageProviderId,
} from './types.js';
import { generateWithNanoBanana } from './adapters/nano-banana-adapter.js';
import { generateWithQwenImage } from './adapters/qwen-image-adapter.js';
import { generateWithGrokImage } from './adapters/grok-image-adapter.js';

export async function generateImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  switch (config.providerId) {
    case 'nano-banana':
      return generateWithNanoBanana(config, options);
    case 'qwen-image':
      return generateWithQwenImage(config, options);
    case 'grok-image':
      return generateWithGrokImage(config, options);
    default:
      throw new Error(`Unsupported image provider: ${String((config as { providerId?: ImageProviderId }).providerId)}`);
  }
}
