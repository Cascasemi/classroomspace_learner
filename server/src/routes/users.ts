import { Router, type Request, type Response } from 'express';
import { protect } from '../middleware/auth.js';
import { LearnerProfile } from '../models/LearnerProfile.js';
import { User } from '../models/User.js';
import {
  MODEL_CATALOGUE,
  IMAGE_CATALOGUE,
  VIDEO_CATALOGUE,
  TTS_CATALOGUE,
  ASR_CATALOGUE,
  isProviderConfigured,
} from '../config/env.js';

const router = Router();

// ---------- GET /api/users/profile ----------
// Get the learner profile for the current user

router.get('/profile', protect, async (req: Request, res: Response): Promise<void> => {
  try {
    const profile = await LearnerProfile.findOne({ userId: req.userId });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    res.json({ profile: profile.toJSON() });
  } catch (error) {
    console.error('[Users] Profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- GET /api/users/child/:childId/profile ----------
// Parent views child's learner profile

router.get('/child/:childId/profile', protect, async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user?.accountType !== 'parent') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Verify this child belongs to the parent
    const parent = await User.findById(req.userId);
    if (!parent?.children.some((c) => c.toString() === req.params.childId)) {
      res.status(403).json({ error: 'This child is not in your account' });
      return;
    }

    const profile = await LearnerProfile.findOne({ userId: req.params.childId });
    const child = await User.findById(req.params.childId);

    if (!profile || !child) {
      res.status(404).json({ error: 'Child profile not found' });
      return;
    }

    res.json({
      child: child.toJSON(),
      profile: profile.toJSON(),
    });
  } catch (error) {
    console.error('[Users] Child profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- PUT /api/users/profile ----------
// Update user profile fields

router.put('/profile', protect, async (req: Request, res: Response): Promise<void> => {
  try {
    const allowedFields = ['preferredName', 'age', 'grade', 'programOfStudy', 'school', 'avatarUrl'];
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user: user.toJSON() });
  } catch (error) {
    console.error('[Users] Update profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- PATCH /api/users/settings ----------
// Update AI model preference (premium users only)

router.patch('/settings', protect, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.subscription !== 'premium') {
      res.status(403).json({ error: 'Model selection is a premium feature' });
      return;
    }

    const { preferredModel } = req.body as { preferredModel?: string };

    if (preferredModel !== undefined) {
      const availableModel = MODEL_CATALOGUE.find(
        (m) => m.id === preferredModel && isProviderConfigured(m.provider),
      );
      if (!availableModel) {
        const validIds = MODEL_CATALOGUE
          .filter((m) => isProviderConfigured(m.provider))
          .map((m) => m.id);
        res.status(400).json({
          error: availableModel === undefined && MODEL_CATALOGUE.some((m) => m.id === preferredModel)
            ? 'This model is not yet available on this server'
            : `Invalid model. Available: ${validIds.join(', ')}`,
        });
        return;
      }
      user.preferredModel = preferredModel;
    }

    await user.save();
    res.json({ user: user.toJSON() });
  } catch (error) {
    console.error('[Users] Settings update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- GET /api/users/models ----------
// List available AI models for the current user tier

router.get('/models', protect, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.userId).select('subscription preferredModel');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // All models are visible to everyone so users can see what's available.
    // Free users see all models but can only use free-tier ones.
    // Models whose provider key is not configured appear with available=false ("Coming Soon").
    const allModels = MODEL_CATALOGUE.map((m) => ({
      ...m,
      available: isProviderConfigured(m.provider),
    }));

    // For free users, additionally mark premium models as not selectable
    const modelsWithAccess = allModels.map((m) =>
      user.subscription !== 'premium' && m.tier === 'premium'
        ? { ...m, requiresPremium: true }
        : { ...m, requiresPremium: false },
    );

    res.json({
      models: modelsWithAccess,
      currentModel: user.preferredModel ?? MODEL_CATALOGUE[0].id,
      tier: user.subscription,
    });
  } catch (error) {
    console.error('[Users] Models error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- GET /api/users/settings-catalogues ----------
// Return all provider catalogues for the settings UI.
// Each entry includes `available` (admin has key) and `requiresPremium`.
// This powers the "Coming Soon" UI for unconfigured providers.

router.get('/settings-catalogues', protect, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.userId).select('subscription');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const withAvailability = <T extends { provider: Parameters<typeof isProviderConfigured>[0] }>(
      list: T[],
    ) =>
      list.map((entry) => ({
        ...entry,
        available: isProviderConfigured(entry.provider),
      }));

    res.json({
      llm: MODEL_CATALOGUE.map((m) => ({
        ...m,
        available: isProviderConfigured(m.provider),
        requiresPremium: user.subscription !== 'premium' && m.tier === 'premium',
      })),
      image: withAvailability(IMAGE_CATALOGUE),
      video: withAvailability(VIDEO_CATALOGUE),
      tts: withAvailability(TTS_CATALOGUE),
      asr: withAvailability(ASR_CATALOGUE),
    });
  } catch (error) {
    console.error('[Users] Settings catalogues error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
