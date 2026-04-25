/**
 * XP & Level Utility — NeuroSpace
 *
 * XP events:
 *   • Scene completed in classroom  → +15 XP per scene
 *   • Quiz question scored          → +score × 10 XP  (e.g. 1/1 correct = +10 XP)
 *   • Tutor session mastered        → +50 XP
 *
 * Level formula — simple linear, every 100 XP = 1 level:
 *   level = floor(totalXP / 100) + 1
 *
 *   Level 1:   0 – 99 XP
 *   Level 2: 100 – 199 XP
 *   Level 3: 200 – 299 XP
 *   …and so on
 *
 * Call `grantXP(userId, amount, reason)` from any route.
 * Fire-and-forget with `.catch()` to avoid blocking SSE / response streams.
 */

import { LearnerProfile } from '../models/LearnerProfile.js';

export type XPReason = 'scene_completed' | 'quiz_correct' | 'tutor_mastered';

/** XP awarded per event type */
export const XP_VALUES: Record<XPReason, number> = {
  scene_completed: 15,
  quiz_correct:    10,   // multiplied by the quiz score (see below)
  tutor_mastered:  50,
};

/** Derive the integer level from cumulative XP. */
export function xpToLevel(totalXP: number): number {
  return Math.floor(Math.max(0, totalXP) / 100) + 1;
}

/**
 * Add `amount` XP to a user's learner profile and recalculate their level.
 *
 * - Creates the profile if it doesn't already exist.
 * - Safe to fire-and-forget.
 *
 * @param userId  Mongo ObjectId string of the user
 * @param amount  XP to award (must be > 0)
 * @param reason  For logging only
 *
 * @returns the updated { totalXP, level }
 */
export async function grantXP(
  userId: string,
  amount: number,
  reason: XPReason,
): Promise<{ totalXP: number; level: number }> {
  if (amount <= 0) return { totalXP: 0, level: 1 };

  // Upsert — create profile if missing (mirrors streak utility)
  let profile = await LearnerProfile.findOne({ userId });
  if (!profile) {
    profile = await LearnerProfile.create({ userId });
  }

  const newXP    = (profile.totalXP ?? 0) + amount;
  const newLevel = xpToLevel(newXP);

  await LearnerProfile.updateOne(
    { userId },
    { $set: { totalXP: newXP, level: newLevel } },
  );

  console.log(`[xp] +${amount} XP (${reason}) → user ${userId} | total=${newXP}, level=${newLevel}`);
  return { totalXP: newXP, level: newLevel };
}
