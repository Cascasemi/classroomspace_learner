/**
 * Curriculum Loader — Phase 3
 *
 * Fetches the curriculum PDF from MongoDB Atlas (native driver) and
 * parses it into text + images ready for the generation pipeline.
 *
 * Flow:
 *   1. Optionally verify premium subscription (skipped in dev when REQUIRE_PREMIUM=false)
 *   2. Find curriculum_pdfs document by { grade, courseId }
 *   3. Fetch the remote PDF binary via HTTP
 *   4. Parse with unpdf → ParsedPdfContent
 */

import { getNativeDb, type CurriculumPdf, type UserSubscription } from './mongodb.js';
import { parsePdfBuffer, type ParsedPdfContent } from './pdf-parser.js';
import {
  PremiumRequiredError,
  CurriculumNotFoundError,
  PdfFetchError,
  PdfParseError,
} from './errors.js';
import { env } from '../config/env.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface LoadCurriculumInput {
  userId: string;
  grade: string;
  courseId: string;
}

export interface LoadedCurriculum {
  grade: string;
  courseId: string;
  subjectName: string;
  pdfContent: ParsedPdfContent;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function isPremiumUser(userId: string): Promise<boolean> {
  const db = await getNativeDb();
  const sub = await db
    .collection<UserSubscription>('user_subscriptions')
    .findOne({ userId, status: 'active' }, { projection: { plan: 1, expiresAt: 1 } });

  if (!sub) return false;
  if (sub.plan === 'free') return false;
  if (sub.expiresAt && sub.expiresAt < new Date()) return false;
  return true;
}

async function fetchPdfBuffer(url: string): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (cause) {
    throw new PdfFetchError(url, cause);
  }
  if (!res.ok) {
    throw new PdfFetchError(url, `HTTP ${res.status} ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Load and parse a curriculum PDF from MongoDB Atlas.
 *
 * @throws {PremiumRequiredError} — user has no active premium subscription
 * @throws {CurriculumNotFoundError} — no document matches grade + courseId
 * @throws {PdfFetchError} — network error fetching the PDF
 * @throws {PdfParseError} — unpdf failed to parse the buffer
 */
export async function loadCurriculum(input: LoadCurriculumInput): Promise<LoadedCurriculum> {
  const { userId, grade, courseId } = input;

  // 1. Premium gate
  if (env.REQUIRE_PREMIUM) {
    const premium = await isPremiumUser(userId);
    if (!premium) throw new PremiumRequiredError();
  }

  // 2. Look up curriculum metadata
  const db = await getNativeDb();
  const doc = await db
    .collection<CurriculumPdf>('curriculum_pdfs')
    .findOne({ grade, courseId }, { projection: { pdfUrl: 1, subjectName: 1 } });

  if (!doc) throw new CurriculumNotFoundError(grade, courseId);

  // 3. Fetch raw PDF
  const pdfBuffer = await fetchPdfBuffer(doc.pdfUrl);

  // 4. Parse PDF
  let pdfContent: ParsedPdfContent;
  try {
    pdfContent = await parsePdfBuffer(pdfBuffer);
  } catch (cause) {
    throw new PdfParseError(cause);
  }

  return {
    grade,
    courseId,
    subjectName: doc.subjectName,
    pdfContent,
  };
}
