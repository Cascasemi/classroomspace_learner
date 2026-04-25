import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { protect } from '../middleware/auth.js';
import { Classroom } from '../models/Classroom.js';
import { User } from '../models/User.js';
import { generateFromCurriculum, generateFromTopic } from '../generation/pipeline.js';
import type { AgentConfig, MediaTask, Scene } from '../generation/types.js';
import {
  collectSceneMediaTasks,
  generateMediaForClassroom,
  mergeMediaTasks,
  resetStaleMediaTasks,
  resolveImageConfigs,
  syncSceneWithMediaTasks,
} from '../utils/classroom-media.js';
import type { MediaTaskStatus } from '../generation/types.js';
import { recordStudyActivity } from '../utils/streak.js';

const FREE_CLASSROOM_LIMIT = 3;

const router = Router();

function sceneHasMissingGeneratedVisuals(scene: Scene): boolean {
  if (scene.type !== 'lesson' || scene.content.type !== 'lesson') return false;
  return scene.content.sections.some(
    (section) =>
      section.type === 'image_placeholder'
      && (!section.imageUrl || section.imageUrl.startsWith('data:image/svg+xml') || section.imageUrl.startsWith('media://')),
  );
}

function createMediaPlaceholderUrl(elementId: string): string {
  return `media://${elementId}`;
}

function repairDuplicateMediaBindings(
  scenes: Scene[],
  tasks: MediaTask[],
): { scenes: Scene[]; tasks: MediaTask[]; changed: boolean } {
  const preferredOwnerByElementId = new Map<string, string>();
  for (const task of tasks) {
    if (!task.elementId || !task.sceneId) continue;
    preferredOwnerByElementId.set(task.elementId, `${task.sceneId}::${task.sectionId || ''}`);
  }

  const claimedElementIds = new Set<string>();
  const referencedElementIds = new Set<string>();
  let changed = false;

  const repairedScenes = scenes.map((scene) => {
    if (scene.type !== 'lesson' || scene.content.type !== 'lesson') return scene;

    return {
      ...scene,
      content: {
        ...scene.content,
        sections: scene.content.sections.map((section) => {
          if (section.type !== 'image_placeholder') return section;

          const originalElementId = section.mediaElementId || `${scene.id}__${section.id}`;
          const ownerKey = `${scene.id}::${section.id}`;
          const preferredOwner = preferredOwnerByElementId.get(originalElementId);

          let nextElementId = originalElementId;
          const originalAlreadyClaimed = claimedElementIds.has(originalElementId);
          const shouldRemap = originalAlreadyClaimed || (preferredOwner && preferredOwner !== ownerKey);

          if (shouldRemap) {
            nextElementId = `${originalElementId}__${scene.id}__${section.id}`;
            changed = true;
          }

          claimedElementIds.add(nextElementId);
          referencedElementIds.add(nextElementId);

          if (nextElementId === originalElementId && section.mediaElementId === originalElementId) {
            return section;
          }

          return {
            ...section,
            mediaElementId: nextElementId,
            mediaStatus: nextElementId === originalElementId ? section.mediaStatus : 'pending',
            imageUrl: nextElementId === originalElementId
              ? section.imageUrl
              : createMediaPlaceholderUrl(nextElementId),
          };
        }),
      },
    };
  });

  const repairedTasks = tasks.filter((task) => referencedElementIds.has(task.elementId));

  return {
    scenes: repairedScenes,
    tasks: repairedTasks,
    changed,
  };
}

async function backfillClassroomImagesIfNeeded(req: Request, classroom: InstanceType<typeof Classroom>): Promise<void> {
  if (classroom.status !== 'ready') return;

  const bindingRepair = repairDuplicateMediaBindings(
    classroom.scenes as Scene[],
    (classroom.mediaTasks || []) as MediaTask[],
  );
  const existingTasks = bindingRepair.tasks;
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const classroomId = String(classroom._id);

  if (bindingRepair.changed) {
    await Classroom.findByIdAndUpdate(classroomId, {
      scenes: bindingRepair.scenes,
      mediaTasks: bindingRepair.tasks,
    });
    classroom.scenes = bindingRepair.scenes as typeof classroom.scenes;
    classroom.mediaTasks = bindingRepair.tasks as typeof classroom.mediaTasks;
  }

  // Step 1: verify that 'done' tasks still have their cached files on disk.
  // After a server restart any ephemeral generated images will be missing.
  const { tasks: validatedTasks, resetCount } = await resetStaleMediaTasks(existingTasks);

  const discoveredTasks = (classroom.scenes as Scene[]).flatMap((scene) => collectSceneMediaTasks(scene));
  const mergedTasks = mergeMediaTasks(validatedTasks, discoveredTasks);
  const seededMissingTasks = mergedTasks.length !== validatedTasks.length;

  // Step 2: decide whether any generation work is needed
  const hasScene = (classroom.scenes as Scene[]).some(sceneHasMissingGeneratedVisuals);
  const hasPending = mergedTasks.some((t) => t.status === 'pending' || t.status === 'failed');
  const isEmpty = mergedTasks.length === 0 && hasScene;

  if (resetCount === 0 && !seededMissingTasks && !hasPending && !isEmpty) return;

  // Step 3: immediately persist any stale-reset tasks so the next client poll
  //         sees 'pending' status and keeps polling (via the hasPendingImages guard).
  if (resetCount > 0 || seededMissingTasks) {
    await Classroom.findByIdAndUpdate(classroomId, { mediaTasks: mergedTasks });
    // Update the in-memory object so the response sent to this request reflects the reset
    classroom.mediaTasks = mergedTasks as typeof classroom.mediaTasks;
  }

  // Step 3b: when mediaTasks is empty but scenes have image placeholders, seed
  //          pending task stubs into DB before firing background generation.
  //          Without this the initial GET response has no tasks, hasPendingImages
  //          is false, and the frontend never polls to pick up generated images.
  if (isEmpty) {
    if (discoveredTasks.length > 0) {
      // Check if providers are configured. If not, mark tasks as disabled immediately.
      const configs = resolveImageConfigs();
      const initialTasks: MediaTask[] = configs.length === 0
        ? discoveredTasks.map(t => ({ ...t, status: 'disabled' as MediaTaskStatus, updatedAt: new Date().toISOString() }))
        : discoveredTasks;

      await Classroom.findByIdAndUpdate(classroomId, { mediaTasks: initialTasks });
      classroom.mediaTasks = initialTasks as typeof classroom.mediaTasks;
    }
  }

  if (!hasPending && !isEmpty) return; // only stale resets found — generation fires on next poll

  // Step 4: fire image generation in the background — intentionally NOT awaited.
  //         Each completed task is saved back to MongoDB via the onTaskUpdate callback
  //         so that subsequent client polls progressively pick up generated images.
  const localScenes: Scene[] = [...(classroom.scenes as Scene[])];
  let localTasks: MediaTask[] = [...mergedTasks];

  generateMediaForClassroom(localScenes, classroomId, baseUrl, {
    existingTasks: localTasks,
    onTaskUpdate: async (task, updatedScene) => {
      localTasks = mergeMediaTasks(localTasks, [task]);
      const idx = localScenes.findIndex((s) => s.id === updatedScene.id);
      if (idx >= 0) localScenes[idx] = updatedScene;
      try {
        await Classroom.findByIdAndUpdate(classroomId, {
          scenes: localScenes,
          mediaTasks: localTasks,
        });
      } catch (err) {
        console.warn('[backfill] Failed to persist task update:', err);
      }
    },
  }).catch((err) => {
    console.warn('[backfill] Background image generation failed:', err);
  });
  // Return immediately — the client polls every 3 s while any task is 'pending' | 'generating'
}

// All classroom routes require authentication
router.use(protect);

// ==================== POST /api/classroom/generate ====================
/**
 * Generate a classroom from a curriculum subject.
 * Runs the two-stage pipeline asynchronously.
 */
const generateSchema = z.object({
  subjectId: z.string().min(1, 'subjectId is required'),
});

router.post('/generate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { subjectId } = generateSchema.parse(req.body);
    const userId = req.userId!;

    // Enforce free-tier classroom limit
    const currentUser = await User.findById(userId);
    if (currentUser && currentUser.subscription === 'free' && currentUser.freeClassroomsUsed >= FREE_CLASSROOM_LIMIT) {
      res.status(403).json({ error: 'Free classroom limit reached. Upgrade to Premium for unlimited classrooms.' });
      return;
    }

    // Create the classroom document in "generating" state
    const classroom = await Classroom.create({
      userId,
      title: 'Generating...',
      description: '',
      subjectId,
      status: 'generating',
      isCustom: false,
      scenes: [],
      mediaTasks: [],
      generation: {
        progress: 0,
        message: 'Starting...',
        scenesCompleted: 0,
        totalScenes: 0,
      },
    });

    // Increment freeClassroomsUsed for free-tier users
    if (currentUser && currentUser.subscription === 'free') {
      await User.findByIdAndUpdate(userId, { $inc: { freeClassroomsUsed: 1 } });
    }

    // Return immediately with the classroom ID
    res.status(201).json({
      classroomId: classroom._id,
      status: 'generating',
      message: 'Classroom generation started',
    });

    // Run the pipeline in the background
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    runPipelineAsync(classroom._id.toString(), userId, 'curriculum', { subjectId }, baseUrl);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error('[classroom-route] Generate error:', err);
    res.status(500).json({ error: 'Failed to start generation' });
  }
});

// ==================== POST /api/classroom/custom ====================
/**
 * Generate a classroom from a free-form topic.
 */
const customSchema = z.object({
  topic: z.string().min(3, 'Topic must be at least 3 characters'),
  grade: z.string().optional(),
});

router.post('/custom', async (req: Request, res: Response): Promise<void> => {
  try {
    const { topic, grade } = customSchema.parse(req.body);
    const userId = req.userId!;

    // Enforce free-tier classroom limit
    const currentUser = await User.findById(userId);
    if (currentUser && currentUser.subscription === 'free' && currentUser.freeClassroomsUsed >= FREE_CLASSROOM_LIMIT) {
      res.status(403).json({ error: 'Free classroom limit reached. Upgrade to Premium for unlimited classrooms.' });
      return;
    }

    const classroom = await Classroom.create({
      userId,
      title: `Custom: ${topic.substring(0, 60)}`,
      description: '',
      grade,
      status: 'generating',
      isCustom: true,
      customTopic: topic,
      scenes: [],
      mediaTasks: [],
      generation: {
        progress: 0,
        message: 'Starting...',
        scenesCompleted: 0,
        totalScenes: 0,
      },
    });

    // Increment freeClassroomsUsed for free-tier users
    if (currentUser && currentUser.subscription === 'free') {
      await User.findByIdAndUpdate(userId, { $inc: { freeClassroomsUsed: 1 } });
    }

    res.status(201).json({
      classroomId: classroom._id,
      status: 'generating',
      message: 'Custom classroom generation started',
    });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    runPipelineAsync(classroom._id.toString(), userId, 'topic', { topic, grade }, baseUrl);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error('[classroom-route] Custom generate error:', err);
    res.status(500).json({ error: 'Failed to start generation' });
  }
});

// ==================== GET /api/classroom/:id ====================
/**
 * Get a classroom by ID (including scenes and progress).
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const classroom = await Classroom.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!classroom) {
      res.status(404).json({ error: 'Classroom not found' });
      return;
    }

    await backfillClassroomImagesIfNeeded(req, classroom);

    res.json(classroom);
  } catch (err) {
    console.error('[classroom-route] Get error:', err);
    res.status(500).json({ error: 'Failed to get classroom' });
  }
});

// ==================== GET /api/classroom ====================
/**
 * List all classrooms for the current user.
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const classrooms = await Classroom.find({ userId: req.userId })
      .select('-scenes') // exclude heavy scene data in list view
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(classrooms);
  } catch (err) {
    console.error('[classroom-route] List error:', err);
    res.status(500).json({ error: 'Failed to list classrooms' });
  }
});

// ==================== PUT /api/classroom/:id/progress ====================
/**
 * Update user progress within a classroom.
 */
const progressSchema = z.object({
  currentSceneIndex: z.number().min(0).optional(),
  currentActionIndex: z.number().min(0).optional(),
  completedSceneId: z.string().optional(),
  timeSpentMs: z.number().min(0).optional(),
});

router.put('/:id/progress', async (req: Request, res: Response): Promise<void> => {
  try {
    const updates = progressSchema.parse(req.body);
    const classroom = await Classroom.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!classroom) {
      res.status(404).json({ error: 'Classroom not found' });
      return;
    }

    if (updates.currentSceneIndex !== undefined) {
      classroom.progress.currentSceneIndex = updates.currentSceneIndex;
    }
    if (updates.currentActionIndex !== undefined) {
      classroom.progress.currentActionIndex = updates.currentActionIndex;
    }
    let sceneJustCompleted = false;
    if (updates.completedSceneId) {
      if (!classroom.progress.completedScenes.includes(updates.completedSceneId)) {
        classroom.progress.completedScenes.push(updates.completedSceneId);
        sceneJustCompleted = true;
      }
    }
    if (updates.timeSpentMs) {
      classroom.progress.totalTimeSpentMs += updates.timeSpentMs;
    }
    classroom.progress.lastAccessedAt = new Date();

    await classroom.save();

    // Trigger streak (Option C — scene completed)
    if (sceneJustCompleted) {
      recordStudyActivity(req.userId!).catch((e) =>
        console.error('[streak] scene complete error:', e),
      );
    }

    res.json({ progress: classroom.progress });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error('[classroom-route] Progress error:', err);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

// ==================== POST /api/classroom/:id/quiz ====================
/**
 * Submit quiz answers for a scene.
 */
const quizSubmitSchema = z.object({
  sceneId: z.string().min(1),
  answers: z.record(z.array(z.string())),
});

router.post('/:id/quiz', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sceneId, answers } = quizSubmitSchema.parse(req.body);
    const classroom = await Classroom.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!classroom) {
      res.status(404).json({ error: 'Classroom not found' });
      return;
    }

    // Find the quiz scene
    const scene = classroom.scenes.find((s) => s.id === sceneId);
    if (!scene || scene.type !== 'quiz') {
      res.status(400).json({ error: 'Invalid quiz scene' });
      return;
    }

    // Grade the quiz
    const quizContent = scene.content as { type: 'quiz'; questions: Array<{
      id: string; answer?: string[]; points?: number;
    }> };
    let totalPoints = 0;
    let earnedPoints = 0;

    for (const question of quizContent.questions) {
      const qPoints = question.points || 10;
      totalPoints += qPoints;

      const userAnswer = answers[question.id];
      const correctAnswer = question.answer;

      if (userAnswer && correctAnswer) {
        const isCorrect =
          userAnswer.length === correctAnswer.length &&
          userAnswer.every((a) => correctAnswer.includes(a));
        if (isCorrect) {
          earnedPoints += qPoints;
        }
      }
    }

    const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

    // Save quiz result
    classroom.progress.quizResults.push({
      sceneId,
      answers,
      score,
      completedAt: new Date(),
    });

    // Mark scene as completed
    if (!classroom.progress.completedScenes.includes(sceneId)) {
      classroom.progress.completedScenes.push(sceneId);
    }

    await classroom.save();

    // Trigger streak (Option C — quiz submitted)
    recordStudyActivity(req.userId!).catch((e) =>
      console.error('[streak] quiz submit error:', e),
    );

    res.json({ score, earnedPoints, totalPoints });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error('[classroom-route] Quiz submit error:', err);
    res.status(500).json({ error: 'Failed to submit quiz' });
  }
});

// ==================== DELETE /api/classroom/:id ====================
/**
 * Delete a classroom.
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await Classroom.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!result) {
      res.status(404).json({ error: 'Classroom not found' });
      return;
    }

    res.json({ message: 'Classroom deleted' });
  } catch (err) {
    console.error('[classroom-route] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete classroom' });
  }
});

// ==================== Background Pipeline Runner ====================

async function runPipelineAsync(
  classroomId: string,
  userId: string,
  mode: 'curriculum' | 'topic',
  params: { subjectId?: string; topic?: string; grade?: string },
  baseUrl: string,
): Promise<void> {
  try {
    let result;
    let earlyReadyTriggered = false;
    let openingScenes: Scene[] = [];
    let latestAgentConfigs: AgentConfig[] = [];
    let mediaTasks: MediaTask[] = [];
    const mediaJobs: Promise<void>[] = [];

    const upsertScene = (scene: Scene) => {
      const nextScene = syncSceneWithMediaTasks(scene, mediaTasks.filter((task) => task.sceneId === scene.id));
      const existingIndex = openingScenes.findIndex((item) => item.id === scene.id);
      if (existingIndex >= 0) {
        openingScenes[existingIndex] = nextScene;
      } else {
        openingScenes.push(nextScene);
      }
      mediaTasks = mergeMediaTasks(mediaTasks, collectSceneMediaTasks(nextScene));
      openingScenes = openingScenes.map((item) => syncSceneWithMediaTasks(item, mediaTasks.filter((task) => task.sceneId === item.id)));
    };

    const persistReadySnapshot = async (
      completedIdx: number,
      total: number,
      title?: string,
      description?: string,
      generationMessage?: string,
    ) => {
      await Classroom.findByIdAndUpdate(classroomId, {
        status: 'ready',
        title: title || (mode === 'topic' ? `Custom Classroom: ${params.topic?.slice(0, 60) || 'Untitled'}` : 'Adaptive Classroom'),
        description: description ?? '',
        scenes: openingScenes,
        mediaTasks,
        agentConfigs: latestAgentConfigs,
        'generation.progress': Math.max(60, Math.round((completedIdx / Math.max(total, 1)) * 85)),
        'generation.message': generationMessage || 'Opening classroom — generating the remaining scenes in the background...',
        'generation.scenesCompleted': completedIdx,
        'generation.totalScenes': total,
      });
    };

    const queueMediaGeneration = (scenesToGenerate: Scene[]) => {
      const job = generateMediaForClassroom(scenesToGenerate, classroomId, baseUrl, {
        existingTasks: mediaTasks,
        onTaskUpdate: async (task, updatedScene) => {
          mediaTasks = mergeMediaTasks(mediaTasks, [task]);
          const updatedIndex = openingScenes.findIndex((item) => item.id === updatedScene.id);
          if (updatedIndex >= 0) {
            openingScenes[updatedIndex] = updatedScene;
          }

          await Classroom.findByIdAndUpdate(classroomId, {
            scenes: openingScenes,
            mediaTasks,
            'generation.message': task.status === 'generating'
              ? 'Generating classroom images...'
              : task.status === 'failed'
                ? 'Some visuals are still retrying...'
                : 'Refreshing classroom visuals...',
          });
        },
      }).then((mediaResult) => {
        mediaTasks = mergeMediaTasks(mediaTasks, mediaResult.mediaTasks);
        openingScenes = openingScenes.map(
          (scene) => mediaResult.scenes.find((item) => item.id === scene.id)
            || syncSceneWithMediaTasks(scene, mediaTasks.filter((task) => task.sceneId === scene.id)),
        );
      }).catch((error) => {
        console.warn(`[pipeline-async] Classroom ${classroomId} media queue failed:`, error);
      });

      mediaJobs.push(job);
    };

    const persistOpeningState = async (
      completedIdx: number,
      total: number,
      title?: string,
      description?: string,
    ) => {
      const earlyReadyTarget = Math.min(2, Math.max(total, 1));
      if (openingScenes.length < earlyReadyTarget) return;
      if (earlyReadyTriggered) return;
      earlyReadyTriggered = true;

      await persistReadySnapshot(completedIdx, total, title, description);
      queueMediaGeneration(openingScenes.slice(0, earlyReadyTarget));
    };

    if (mode === 'curriculum' && params.subjectId) {
      result = await generateFromCurriculum(
        userId,
        params.subjectId,
        async (progress) => {
          if (progress.agentConfigs?.length) latestAgentConfigs = progress.agentConfigs;
          await Classroom.findByIdAndUpdate(classroomId, {
            'generation.progress': progress.overallProgress,
            'generation.message': progress.message,
            'generation.scenesCompleted': progress.scenesCompleted,
            'generation.totalScenes': progress.totalScenes,
            ...(progress.agentConfigs?.length ? { agentConfigs: progress.agentConfigs } : {}),
          });
        },
        async (scene, completedIdx, total, title, agentConfigs) => {
          latestAgentConfigs = agentConfigs;
          upsertScene(scene);

          if (earlyReadyTriggered) {
            await persistReadySnapshot(completedIdx, total, title);
            queueMediaGeneration([scene]);
            return;
          }

          await persistOpeningState(completedIdx, total, title);
        },
      );
    } else if (mode === 'topic' && params.topic) {
      result = await generateFromTopic(
        userId,
        params.topic,
        params.grade,
        async (progress) => {
          if (progress.agentConfigs?.length) latestAgentConfigs = progress.agentConfigs;
          await Classroom.findByIdAndUpdate(classroomId, {
            'generation.progress': progress.overallProgress,
            'generation.message': progress.message,
            'generation.scenesCompleted': progress.scenesCompleted,
            'generation.totalScenes': progress.totalScenes,
            ...(progress.agentConfigs?.length ? { agentConfigs: progress.agentConfigs } : {}),
          });
        },
        async (scene, completedIdx, total, title, agentConfigs) => {
          latestAgentConfigs = agentConfigs;
          upsertScene(scene);

          if (earlyReadyTriggered) {
            await persistReadySnapshot(completedIdx, total, title);
            queueMediaGeneration([scene]);
            return;
          }

          await persistOpeningState(completedIdx, total, title);
        },
      );
    } else {
      throw new Error('Invalid pipeline parameters');
    }

    if (result.success && result.scenes) {
      await Promise.allSettled(mediaJobs);

      await Classroom.findByIdAndUpdate(classroomId, {
        'generation.progress': 95,
        'generation.message': 'Generating classroom images...',
      });

      try {
        mediaTasks = mergeMediaTasks(mediaTasks, result.mediaTasks ?? []);
        const mediaResult = await generateMediaForClassroom(result.scenes, classroomId, baseUrl, {
          existingTasks: mediaTasks,
        });
        mediaTasks = mediaResult.mediaTasks;
        result.scenes = mediaResult.scenes;
      } catch (error) {
        console.warn(`[pipeline-async] Classroom ${classroomId} image generation failed:`, error);
      }

      await Classroom.findByIdAndUpdate(classroomId, {
        status: 'ready',
        title: result.title,
        description: result.description,
        scenes: result.scenes,
        mediaTasks,
        agentConfigs: result.agentConfigs ?? latestAgentConfigs,
        'generation.progress': 100,
        'generation.message': 'All scenes ready!',
        'generation.scenesCompleted': result.scenes.length,
        'generation.totalScenes': result.scenes.length,
      });
      console.log(`[pipeline-async] Classroom ${classroomId} ready with ${result.scenes.length} scenes`);
    } else {
      await Classroom.findByIdAndUpdate(classroomId, {
        ...(earlyReadyTriggered ? {} : { status: 'error' }),
        errorMessage: result.error || 'Generation failed',
        mediaTasks,
        'generation.message': result.error || 'Generation failed',
      });
      console.error(`[pipeline-async] Classroom ${classroomId} failed: ${result.error}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Pipeline crashed';
    await Classroom.findByIdAndUpdate(classroomId, {
      status: 'error',
      errorMessage: message,
    });
    console.error(`[pipeline-async] Classroom ${classroomId} crashed:`, message);
  }
}

export default router;
