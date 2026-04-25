/**
 * Native MongoDB client singleton for Phase 3 collections.
 *
 * Uses the native `mongodb` driver (NOT Mongoose) as required for the
 * curriculum_pdfs, learning_sessions, and user_subscriptions collections.
 * The existing Mongoose connection (config/db.ts) is unaffected.
 *
 * Collection schemas:
 *
 * curriculum_pdfs
 *   { _id, grade, courseId, subjectName, pdfUrl, createdAt, updatedAt }
 *   Unique index: { grade: 1, courseId: 1 }
 *
 * learning_sessions
 *   { _id, userId, courseId, classroomId, sceneIndex, progressMs,
 *     completedScenes, startedAt, lastSeenAt }
 *   Unique index: { userId: 1, courseId: 1 }
 *
 * user_subscriptions
 *   { _id, userId, plan, status, expiresAt, createdAt, updatedAt }
 *   Index: { userId: 1, status: 1 }
 */

import { MongoClient, type Db } from 'mongodb';
import { env } from '../config/env.js';

// ── Collection document interfaces ─────────────────────────────────────────

export interface CurriculumPdf {
  grade: string;
  courseId: string;
  subjectName: string;
  pdfUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LearningSession {
  userId: string;
  courseId: string;
  classroomId: string;
  /** Zero-based index of the current scene */
  sceneIndex: number;
  /** Playback offset in milliseconds within the current scene */
  progressMs: number;
  /** Set of scene indexes the learner has fully completed */
  completedScenes: number[];
  startedAt: Date;
  lastSeenAt: Date;
}

export interface UserSubscription {
  userId: string;
  /** 'free' | 'premium' | 'teacher' */
  plan: string;
  /** 'active' | 'expired' | 'cancelled' */
  status: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ── Singleton ───────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __nativeMongoClient: MongoClient | undefined;
}

let _client: MongoClient | undefined;

async function getClient(): Promise<MongoClient> {
  if (_client) return _client;

  // In development, cache on globalThis to survive hot-reload (tsx watch)
  if (process.env.NODE_ENV !== 'production' && global.__nativeMongoClient) {
    _client = global.__nativeMongoClient;
    return _client;
  }

  const client = new MongoClient(env.MONGODB_URI, {
    // Lean settings — Mongoose already has a connection open to the same host
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 30_000,
  });

  await client.connect();
  _client = client;

  if (process.env.NODE_ENV !== 'production') {
    global.__nativeMongoClient = client;
  }

  return client;
}

// ── Database accessor ───────────────────────────────────────────────────────

const DB_NAME = 'openclass_learner';

export async function getNativeDb(): Promise<Db> {
  const client = await getClient();
  return client.db(DB_NAME);
}
