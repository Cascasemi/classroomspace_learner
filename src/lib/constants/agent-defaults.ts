/**
 * Agent Profile Constants
 *
 * Shared color palette and avatar paths cycled for agent cards / speech bubbles.
 */

/** Color palette cycled for generated / custom agents */
export const AGENT_COLOR_PALETTE = [
  '#3b82f6', // blue  — Ms. Nova (teacher)
  '#10b981', // emerald — Jamie (assistant)
  '#f59e0b', // amber — Alex (student)
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#f97316', // orange
  '#14b8a6', // teal
  '#e11d48', // rose
  '#6366f1', // indigo
  '#84cc16', // lime
  '#a855f7', // purple
] as const;

/**
 * Default avatar paths cycled for generated agents.
 * Each entry must exist under public/avatars/.
 *
 * Index 0 = teacher, 1 = assistant, 2+ = students / extras.
 */
export const AGENT_DEFAULT_AVATARS = [
  '/avatars/females/teacher_lady.jpg',   // teacher (female)
  '/avatars/females/Assistant.svg',      // assistant (female)
  '/avatars/males/Brian.svg',            // student (male)
  '/avatars/males/Adrian.svg',           // student (male)
  '/avatars/females/Amaya.svg',          // student (female)
  '/avatars/males/Avery.svg',            // student (male)
  '/avatars/females/Assistant1.svg',     // assistant (female)
  '/avatars/males/Assistant2.svg',       // assistant (male)
  '/avatars/males/Foster.svg',           // student (male)
  '/avatars/males/Kwame_Male.svg',       // student (male)
] as const;

/** Role labels for display */
export const AGENT_ROLE_LABELS: Record<string, string> = {
  teacher: 'Lead Teacher',
  assistant: 'Teaching Assistant',
  student: 'Student',
};
