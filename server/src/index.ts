import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import classroomRoutes from './routes/classroom.js';
import { transcriptionRouter } from './routes/transcription.js';
import { discussRouter } from './routes/discuss.js';
import { interruptRouter }           from './routes/interrupt.js';
import { askRouter }                from './routes/ask.js';
import { discussionRoomRouter }    from './routes/discussion-room.js';
import { quizGradeRouter } from './routes/quiz-grade.js';
import { mathCheckRouter } from './routes/math-check.js';
import { CLASSROOM_MEDIA_ROOT } from './utils/classroom-media.js';

const app = express();

// ---------- Middleware ----------

app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use('/api/classroom-media', express.static(CLASSROOM_MEDIA_ROOT, {
  setHeaders: (res) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', env.CLIENT_URL);
  },
}));

// ── Rate limiters ─────────────────────────────────────────────────────────────
// Tiered by computational cost. SSE/LLM routes are tightest — each call
// triggers one or more full LLM completions.

/** Cheap reads — curriculum list, profile, health */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

/** Auth — register / login (brute-force protection) */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Try again in 15 minutes.' },
});

/** Classroom generation — expensive multi-stage LLM pipeline */
const generationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Classroom generation limit reached. Try again in an hour.' },
});

/** Tutor chat + discuss — each request = 1-3 LLM calls */
const llmStreamLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI request limit reached. Try again in 15 minutes.' },
});

/** Transcription — proxies to Whisper */
const transcriptionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Transcription limit reached. Try again in 15 minutes.' },
});

// Apply general limiter as the baseline for all /api/ routes
app.use('/api/', generalLimiter);

// Tighter limiters on specific expensive / sensitive routes
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/classroom/generate', generationLimiter);
app.use('/api/classroom/custom', generationLimiter);
app.use('/api/discuss',           llmStreamLimiter);
app.use('/api/interrupt',         llmStreamLimiter);
app.use('/api/ask',               llmStreamLimiter);
app.use('/api/discussion-room',   llmStreamLimiter);
app.use('/api/math-check',        llmStreamLimiter);
app.use('/api/transcription',   transcriptionLimiter);

// ---------- Routes ----------

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/classroom', classroomRoutes);
app.use('/api/transcription', transcriptionRouter);
app.use('/api/discuss', discussRouter);
app.use('/api/interrupt',         interruptRouter);
app.use('/api/ask',             askRouter);
app.use('/api/discussion-room', discussionRoomRouter);
app.use('/api/quiz-grade', quizGradeRouter);
app.use('/api/math-check', mathCheckRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------- Start ----------

async function start() {
  await connectDB();
  app.listen(env.PORT, () => {
    console.log(`[Server] Openclass Learner API running on port ${env.PORT} (${env.NODE_ENV})`);
  });
}

start().catch(console.error);

export default app;
