import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { env, IMAGE_CATALOGUE, isProviderConfigured } from '../config/env.js';
import type {
  ContentSection,
  MediaTask,
  MediaTaskStatus,
  Scene,
} from '../generation/types.js';
import { generateImage } from '../media/image-providers.js';
import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../media/types.js';

export const CLASSROOM_MEDIA_ROOT = path.resolve(process.cwd(), 'generated', 'classroom-media');

const MEDIA_CACHE_DIR = path.join(CLASSROOM_MEDIA_ROOT, 'cache');
const MEDIA_CONCURRENCY = 2;

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function downloadToBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function buildMediaPublicUrl(baseUrl: string, relativePath: string): string {
  return `${baseUrl}/api/classroom-media/${relativePath.replace(/\\/g, '/')}`;
}

function resolveQwenImageBaseUrl(): string {
  return (env.QWEN_IMAGE_BASE_URL || env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com').replace(/\/compatible-mode\/v1\/?$/, '');
}

function mapEntryToImageConfig(entry: (typeof IMAGE_CATALOGUE)[number]): ImageGenerationConfig | null {
  switch (entry.provider) {
    case 'gemini':
      return {
        providerId: 'nano-banana',
        apiKey: env.GEMINI_IMAGE_API_KEY,
        baseUrl: env.GEMINI_IMAGE_BASE_URL,
        model: env.GEMINI_IMAGE_MODEL || entry.id,
      };
    case 'qwen':
      return {
        providerId: 'qwen-image',
        apiKey: env.QWEN_IMAGE_API_KEY,
        baseUrl: resolveQwenImageBaseUrl(),
        model: env.QWEN_IMAGE_MODEL || entry.id,
      };
    case 'grok':
      return {
        providerId: 'grok-image',
        apiKey: env.GROK_IMAGE_API_KEY,
        baseUrl: env.GROK_IMAGE_BASE_URL,
        model: env.GROK_IMAGE_MODEL || entry.id,
      };
    default:
      return null;
  }
}

export function resolveImageConfigs(): ImageGenerationConfig[] {
  return IMAGE_CATALOGUE
    .filter((entry) => isProviderConfigured(entry.provider))
    .map((entry) => mapEntryToImageConfig(entry))
    .filter((config): config is ImageGenerationConfig => Boolean(config));
}

export function isMediaPlaceholderUrl(imageUrl?: string): boolean {
  return typeof imageUrl === 'string' && imageUrl.startsWith('media://');
}

function isSyntheticPlaceholder(imageUrl?: string): boolean {
  return typeof imageUrl === 'string' && imageUrl.startsWith('data:image/svg+xml');
}

function isRenderableImageUrl(imageUrl?: string): boolean {
  return !!imageUrl && !isMediaPlaceholderUrl(imageUrl) && !isSyntheticPlaceholder(imageUrl);
}

function createMediaPlaceholderUrl(elementId: string): string {
  return `media://${elementId}`;
}

function resolvePrompt(section: ContentSection, scene: Scene): string {
  const detail = section.imagePrompt || section.caption || section.content || scene.title;
  return [
    `Create a clean educational 16:9 illustration for the lesson scene titled "${scene.title}".`,
    detail,
    'Use a clear instructional style, accurate subject details, and visual clarity suitable for a classroom slide.',
    'Avoid watermarks, UI chrome, and decorative text unless labels are necessary for understanding.',
  ].join(' ');
}

function nowIso(): string {
  return new Date().toISOString();
}

function inferTaskStatus(section: ContentSection): MediaTaskStatus {
  if (section.mediaStatus) return section.mediaStatus;
  if (isRenderableImageUrl(section.imageUrl)) return 'done';
  return 'pending';
}

export function collectSceneMediaTasks(scene: Scene): MediaTask[] {
  if (scene.type !== 'lesson' || scene.content.type !== 'lesson') return [];

  return scene.content.sections.flatMap((section) => {
    if (section.type !== 'image_placeholder') return [];

    const elementId = section.mediaElementId || `${scene.id}__${section.id}`;
    const status = inferTaskStatus(section);
    const timestamp = nowIso();

    return [{
      elementId,
      sceneId: scene.id,
      sectionId: section.id,
      type: 'image',
      prompt: resolvePrompt(section, scene),
      aspectRatio: '16:9',
      style: undefined,
      slot: section.mediaSlot,
      status,
      imageUrl: isRenderableImageUrl(section.imageUrl) ? section.imageUrl : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    } satisfies MediaTask];
  });
}

export function mergeMediaTasks(existing: MediaTask[], incoming: MediaTask[]): MediaTask[] {
  const merged = new Map<string, MediaTask>();

  for (const task of existing) {
    merged.set(task.elementId, task);
  }

  for (const task of incoming) {
    const current = merged.get(task.elementId);
    if (!current) {
      merged.set(task.elementId, task);
      continue;
    }

    merged.set(task.elementId, pickPreferredTask(current, task));
  }

  return Array.from(merged.values());
}

function pickPreferredTask(current: MediaTask, incoming: MediaTask): MediaTask {
  const statusRank: Record<MediaTaskStatus, number> = {
    disabled: 0,
    pending: 1,
    generating: 2,
    failed: 3,
    done: 4,
  };

  const preferred = statusRank[incoming.status] >= statusRank[current.status] ? incoming : current;
  return {
    ...current,
    ...preferred,
    imageUrl: preferred.imageUrl || current.imageUrl,
    error: preferred.error || current.error,
    updatedAt: preferred.updatedAt || current.updatedAt,
  };
}

export function syncSceneWithMediaTasks(scene: Scene, mediaTasks: MediaTask[]): Scene {
  if (scene.type !== 'lesson' || scene.content.type !== 'lesson') return scene;

  const tasksById = new Map(mediaTasks.map((task) => [task.elementId, task]));

  return {
    ...scene,
    content: {
      ...scene.content,
      sections: scene.content.sections.map((section) => {
        if (section.type !== 'image_placeholder') return section;

        const elementId = section.mediaElementId || `${scene.id}__${section.id}`;
        const task = tasksById.get(elementId);
        const nextStatus = task?.status || inferTaskStatus(section);
        const nextImageUrl = task?.status === 'done' && task.imageUrl
          ? task.imageUrl
          : isRenderableImageUrl(section.imageUrl)
            ? section.imageUrl
            : createMediaPlaceholderUrl(elementId);

        return {
          ...section,
          mediaElementId: elementId,
          mediaStatus: nextStatus,
          imageUrl: nextImageUrl,
        };
      }),
    },
  };
}

function buildCacheKey(task: MediaTask): string {
  const normalizedPrompt = task.prompt.trim().toLowerCase().replace(/\s+/g, ' ');
  return createHash('sha1')
    .update(JSON.stringify({
      prompt: normalizedPrompt,
      aspectRatio: task.aspectRatio || '16:9',
      slot: task.slot || 'supporting',
      style: task.style || '',
    }))
    .digest('hex');
}

function buildCacheFilePath(cacheKey: string): string {
  return path.join(MEDIA_CACHE_DIR, `${cacheKey}.png`);
}

function buildCachePublicUrl(baseUrl: string, cacheKey: string): string {
  return buildMediaPublicUrl(baseUrl, `cache/${cacheKey}.png`);
}

function buildGenerationOptions(task: MediaTask): ImageGenerationOptions {
  return {
    prompt: task.prompt,
    aspectRatio: task.aspectRatio || '16:9',
    width: 1280,
    height: 720,
    style: task.style,
  };
}

function orderConfigsForTask(
  configs: ImageGenerationConfig[],
  task: MediaTask,
): ImageGenerationConfig[] {
  const preferred = new Map<string, number>();
  const style = (task.style || '').toLowerCase();

  if (/(photo|realistic|photoreal)/.test(style)) {
    preferred.set('grok-image', 3);
    preferred.set('nano-banana', 2);
    preferred.set('qwen-image', 1);
  } else if (task.slot === 'comparison' || task.slot === 'process' || task.slot === 'diagram') {
    preferred.set('qwen-image', 3);
    preferred.set('nano-banana', 2);
    preferred.set('grok-image', 1);
  } else {
    preferred.set('nano-banana', 3);
    preferred.set('qwen-image', 2);
    preferred.set('grok-image', 1);
  }

  return [...configs].sort((a, b) => (preferred.get(b.providerId) || 0) - (preferred.get(a.providerId) || 0));
}

async function normalizeGeneratedBuffer(result: ImageGenerationResult): Promise<Buffer> {
  const source = result.bytes
    ? result.bytes
    : result.base64
    ? Buffer.from(result.base64, 'base64')
    : result.url
      ? await downloadToBuffer(result.url)
      : null;

  if (!source) {
    throw new Error('Image provider returned neither URL nor base64 content');
  }

  return sharp(source)
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();
}

async function resolveTaskFromCache(task: MediaTask, baseUrl: string): Promise<MediaTask | null> {
  const cacheKey = buildCacheKey(task);
  const cacheFilePath = buildCacheFilePath(cacheKey);

  try {
    await fs.access(cacheFilePath);
    return {
      ...task,
      status: 'done',
      imageUrl: buildCachePublicUrl(baseUrl, cacheKey),
      cached: true,
      updatedAt: nowIso(),
      error: undefined,
    };
  } catch {
    return null;
  }
}

async function generateTaskImage(
  configs: ImageGenerationConfig[],
  task: MediaTask,
  baseUrl: string,
): Promise<MediaTask> {
  const cached = await resolveTaskFromCache(task, baseUrl);
  if (cached) return cached;

  const cacheKey = buildCacheKey(task);
  const cacheFilePath = buildCacheFilePath(cacheKey);
  let lastError: unknown = null;

  for (const config of orderConfigsForTask(configs, task)) {
    try {
      const result = await generateImage(config, buildGenerationOptions(task));
      const pngBuffer = await normalizeGeneratedBuffer(result);
      await ensureDir(MEDIA_CACHE_DIR);
      await fs.writeFile(cacheFilePath, pngBuffer);

      return {
        ...task,
        status: 'done',
        providerId: config.providerId,
        imageUrl: buildCachePublicUrl(baseUrl, cacheKey),
        cached: false,
        attempts: (task.attempts || 0) + 1,
        error: undefined,
        updatedAt: nowIso(),
      };
    } catch (error) {
      lastError = error;
      console.warn(`[classroom-media] ${config.providerId} failed for ${task.elementId}; trying next provider.`);
    }
  }

  return {
    ...task,
    status: 'failed',
    attempts: (task.attempts || 0) + 1,
    error: lastError instanceof Error ? lastError.message : 'No configured image provider succeeded',
    updatedAt: nowIso(),
  };
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const size = Math.max(1, Math.min(limit, queue.length || 1));

  await Promise.all(Array.from({ length: size }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      await worker(next);
    }
  }));
}

/**
 * Check each 'done' task's cached file still exists on disk.
 * If the file was deleted (e.g. after a server restart with ephemeral storage),
 * the task is reset to 'pending' so it gets regenerated on the next backfill pass.
 */
export async function resetStaleMediaTasks(
  tasks: MediaTask[],
): Promise<{ tasks: MediaTask[]; resetCount: number }> {
  let resetCount = 0;
  const validated = await Promise.all(
    tasks.map(async (task) => {
      if (task.status !== 'done' || !task.imageUrl) return task;
      const cacheKey = buildCacheKey(task);
      const cacheFilePath = buildCacheFilePath(cacheKey);
      try {
        await fs.access(cacheFilePath);
        return task; // file still present — keep as done
      } catch {
        // Cache file missing — revert to pending for regeneration
        resetCount++;
        return {
          ...task,
          status: 'pending' as MediaTaskStatus,
          imageUrl: undefined,
          cached: undefined,
          error: undefined,
          updatedAt: nowIso(),
        };
      }
    }),
  );
  return { tasks: validated, resetCount };
}

export async function generateMediaForClassroom(
  scenes: Scene[],
  _classroomId: string,
  baseUrl: string,
  options?: {
    existingTasks?: MediaTask[];
    concurrency?: number;
    onTaskUpdate?: (task: MediaTask, scene: Scene) => Promise<void> | void;
  },
): Promise<{ generatedCount: number; scenes: Scene[]; mediaTasks: MediaTask[] }> {
  const configs = resolveImageConfigs();
  const discoveredTasks = scenes.flatMap((scene) => collectSceneMediaTasks(scene));
  const tasks = mergeMediaTasks(options?.existingTasks ?? [], discoveredTasks);
  const tasksById = new Map(tasks.map((task) => [task.elementId, task]));
  let syncedScenes = scenes.map((scene) => syncSceneWithMediaTasks(scene, tasks.filter((task) => task.sceneId === scene.id)));

  if (configs.length === 0) {
    const disabledTasks: MediaTask[] = tasks.map((task) => ({
      ...task,
      status: isRenderableImageUrl(task.imageUrl) ? 'done' : 'disabled',
      error: isRenderableImageUrl(task.imageUrl) ? undefined : 'No image providers are configured on the server',
      updatedAt: nowIso(),
    }));

    syncedScenes = syncedScenes.map((scene) => syncSceneWithMediaTasks(scene, disabledTasks.filter((task) => task.sceneId === scene.id)));

    // Notify the caller about each disabled task so it can persist the state.
    // Without this, the DB is never updated and the frontend keeps showing
    // "Visual planned" (pending) instead of "Visual skipped" (disabled).
    if (options?.onTaskUpdate) {
      for (const task of disabledTasks) {
        const scene = syncedScenes.find((s) => s.id === task.sceneId) ?? syncedScenes[0];
        await options.onTaskUpdate(task, scene);
      }
    }

    return { generatedCount: 0, scenes: syncedScenes, mediaTasks: disabledTasks };
  }

  const pendingTasks = tasks.filter(
    (task) => task.type === 'image'
      && task.status !== 'done'
      && task.status !== 'disabled'
      && task.status !== 'generating',
  );
  let generatedCount = 0;

  await ensureDir(CLASSROOM_MEDIA_ROOT);

  await runWithConcurrency(pendingTasks, options?.concurrency ?? MEDIA_CONCURRENCY, async (task) => {
    const generatingTask: MediaTask = {
      ...task,
      status: 'generating',
      updatedAt: nowIso(),
    };

    tasksById.set(task.elementId, generatingTask);
    let scene = syncSceneWithMediaTasks(
      syncedScenes.find((item) => item.id === task.sceneId) || scenes.find((item) => item.id === task.sceneId) || scenes[0],
      Array.from(tasksById.values()).filter((item) => item.sceneId === task.sceneId),
    );
    syncedScenes = syncedScenes.map((item) => (item.id === scene.id ? scene : item));
    await options?.onTaskUpdate?.(generatingTask, scene);

    const resolvedTask = await generateTaskImage(configs, generatingTask, baseUrl);
    if (resolvedTask.status === 'done') generatedCount += 1;

    tasksById.set(resolvedTask.elementId, resolvedTask);
    scene = syncSceneWithMediaTasks(
      scene,
      Array.from(tasksById.values()).filter((item) => item.sceneId === task.sceneId),
    );
    syncedScenes = syncedScenes.map((item) => (item.id === scene.id ? scene : item));
    await options?.onTaskUpdate?.(resolvedTask, scene);
  });

  return {
    generatedCount,
    scenes: syncedScenes,
    mediaTasks: Array.from(tasksById.values()),
  };
}
