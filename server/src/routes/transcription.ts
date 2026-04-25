/**
 * Transcription Route — Server-side ASR via OpenAI Whisper
 *
 * POST /api/transcription
 * Accepts a recorded audio file and returns a text transcript.
 * Falls back cleanly when OPENAI_WHISPER_URL is not configured.
 *
 * Openclass_learner: English-only, single provider (Whisper).
 */

import { Router } from 'express';
import multer from 'multer';
import FormData from 'form-data';
import { protect } from '../middleware/auth.js';
import { env } from '../config/env.js';

const router = Router();

// Store audio in memory (max 25 MB — Whisper limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

/**
 * POST /api/transcription
 * Body: multipart/form-data with field "audio" (audio blob)
 * Returns: { text: string }
 */
router.post('/', protect, upload.single('audio'), async (req, res): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No audio file provided' });
      return;
    }

    // Check Whisper is configured
    if (!env.OPENAI_WHISPER_URL || !env.OPENAI_API_KEY) {
      res.status(503).json({
        error: 'Server-side transcription not configured. Use browser ASR instead.',
        code: 'WHISPER_NOT_CONFIGURED',
      });
      return;
    }

    // Build FormData for Whisper API
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname || 'audio.webm',
      contentType: req.file.mimetype || 'audio/webm',
    });
    formData.append('model', 'whisper-1');
    formData.append('language', 'en'); // English-only for Openclass_learner

    const whisperRes = await fetch(env.OPENAI_WHISPER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        ...formData.getHeaders(),
      },
      // @ts-expect-error — node-fetch form-data compatibility
      body: formData,
    });

    if (!whisperRes.ok) {
      const errBody = await whisperRes.text();
      console.error('[transcription] Whisper API error:', errBody);
      res.status(502).json({ error: 'Transcription service error' });
      return;
    }

    const result = await whisperRes.json() as { text: string };
    res.json({ text: result.text?.trim() || '' });
  } catch (err) {
    console.error('[transcription] Error:', err);
    res.status(500).json({ error: 'Internal transcription error' });
  }
});

export const transcriptionRouter = router;
