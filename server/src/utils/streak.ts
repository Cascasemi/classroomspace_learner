/**
 * Streak Utility — Openclass_learner
 *
 * Option-C definition: any of the following in a calendar day counts as a study day:
 *   1. At least one classroom scene completed
 *   2. A quiz submitted
 *   3. A tutor chat exchange (user message + tutor reply saved, i.e. >= 2 messages)
 *
 * Call `recordStudyActivity(userId)` from each of these server-side trigger points.
 * The function is idempotent within the same calendar day — multiple calls record
 * only one study day.
 */

import { LearnerProfile } from '../models/LearnerProfile.js';

/**
 * Returns today's date as YYYY-MM-DD in UTC.
 * Using UTC avoids timezone edge-case double-counting.
 */
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns yesterday's date as YYYY-MM-DD in UTC.
 */
function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Record a study activity for a user. Updates streak, longestStreak,
 * lastActiveDate and the studyDays rolling window (last 365 days).
 *
 * Safe to call multiple times per day — only the first call per calendar
 * day makes any changes to the streak counter.
 *
 * @returns the updated { streak, longestStreak } values (for optional response)
 */
export async function recordStudyActivity(
  userId: string,
): Promise<{ streak: number; longestStreak: number }> {
  const today = todayUTC();
  const yesterday = yesterdayUTC();

  // Upsert: create profile if it doesn't exist yet
  let profile = await LearnerProfile.findOne({ userId });
  if (!profile) {
    profile = await LearnerProfile.create({ userId });
  }

  const studyDays: string[] = (profile.studyDays as string[] | undefined) ?? [];

  // Already recorded today — nothing to update
  if (studyDays.includes(today)) {
    return {
      streak: profile.streak,
      longestStreak: (profile.longestStreak as number | undefined) ?? profile.streak,
    };
  }

  // ── Calculate new streak ──────────────────────────────────────────────────
  let newStreak: number;
  const lastDate = profile.lastActiveDate
    ? profile.lastActiveDate.toISOString().slice(0, 10)
    : null;

  if (lastDate === yesterday) {
    // Consecutive day — extend streak
    newStreak = (profile.streak ?? 0) + 1;
  } else if (lastDate === today) {
    // Shouldn't reach here (we checked studyDays above), but guard anyway
    newStreak = profile.streak ?? 1;
  } else {
    // Missed at least one day — reset streak to 1
    newStreak = 1;
  }

  // ── Rolling 365-day window ────────────────────────────────────────────────
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 365);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const trimmed = studyDays.filter((d) => d >= cutoffStr);
  trimmed.push(today);
  // Keep sorted for easy traversal
  trimmed.sort();

  const longestStreak = Math.max(
    (profile.longestStreak as number | undefined) ?? 0,
    newStreak,
  );

  await LearnerProfile.updateOne(
    { userId },
    {
      $set: {
        streak: newStreak,
        longestStreak,
        lastActiveDate: new Date(),
        studyDays: trimmed,
      },
    },
  );

  return { streak: newStreak, longestStreak };
}
