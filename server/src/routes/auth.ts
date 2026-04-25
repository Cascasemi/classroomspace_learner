import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { LearnerProfile } from '../models/LearnerProfile.js';
import { signToken } from '../utils/jwt.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// ---------- Validation Schemas ----------

const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  accountType: z.enum(['parent', 'student']),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

const onboardingSchema = z.object({
  preferredName: z.string().min(1).max(50),
  age: z.number().int().min(4).max(100),
  grade: z.string().min(1).max(30),
  programOfStudy: z.string().max(100).optional(),
  school: z.string().max(100).optional(),
});

const addChildSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  preferredName: z.string().min(1).max(50),
});

// ---------- POST /api/auth/register ----------

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = registerSchema.parse(req.body);

    // Check if email already exists
    const existing = await User.findOne({ email: data.email });
    if (existing) {
      res.status(400).json({ error: 'Email already in use' });
      return;
    }

    const user = await User.create({
      email: data.email,
      password: data.password,
      accountType: data.accountType,
    });

    // Create empty learner profile
    await LearnerProfile.create({ userId: user._id });

    const token = signToken({
      userId: user._id.toString(),
      accountType: user.accountType,
    });

    res.status(201).json({
      token,
      user: user.toJSON(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('[Auth] Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- POST /api/auth/login ----------

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await User.findOne({ email: data.email }).select('+password');
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const isMatch = await user.comparePassword(data.password);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = signToken({
      userId: user._id.toString(),
      accountType: user.accountType,
    });

    res.json({
      token,
      user: user.toJSON(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- GET /api/auth/me ----------

router.get('/me', protect, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.userId).populate('children', 'preferredName email grade avatarUrl');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user: user.toJSON() });
  } catch (error) {
    console.error('[Auth] Me error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- PUT /api/auth/onboarding ----------

router.put('/onboarding', protect, async (req: Request, res: Response): Promise<void> => {
  try {
    const data = onboardingSchema.parse(req.body);

    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        ...data,
        onboardingCompleted: true,
      },
      { new: true },
    );

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user: user.toJSON() });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('[Auth] Onboarding error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- POST /api/auth/children (parent adds a child) ----------

router.post('/children', protect, async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user?.accountType !== 'parent') {
      res.status(403).json({ error: 'Only parent accounts can add children' });
      return;
    }

    const data = addChildSchema.parse(req.body);

    // Check if email already exists
    const existing = await User.findOne({ email: data.email });
    if (existing) {
      res.status(400).json({ error: 'Email already in use' });
      return;
    }

    // Create child account
    const child = await User.create({
      email: data.email,
      password: data.password,
      accountType: 'student',
      preferredName: data.preferredName,
      parentId: req.userId,
      subscription: req.user.subscription, // inherit parent's subscription
    });

    // Create empty learner profile for child
    await LearnerProfile.create({ userId: child._id });

    // Add child reference to parent
    await User.findByIdAndUpdate(req.userId, {
      $push: { children: child._id },
    });

    res.status(201).json({ child: child.toJSON() });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('[Auth] Add child error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- GET /api/auth/children (parent views children) ----------

router.get('/children', protect, async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user?.accountType !== 'parent') {
      res.status(403).json({ error: 'Only parent accounts can view children' });
      return;
    }

    const parent = await User.findById(req.userId).populate(
      'children',
      'preferredName email grade school age avatarUrl onboardingCompleted subscription',
    );

    res.json({ children: parent?.children || [] });
  } catch (error) {
    console.error('[Auth] Children error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
