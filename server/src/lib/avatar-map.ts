/**
 * Avatar Mapping — Server-side
 *
 * Maps avatar files from /public/avatars/ to agent roles and genders.
 * Mirrors the frontend avatar-map.ts logic.
 */

export type AgentRole = 'teacher' | 'assistant' | 'student';
export type Gender = 'female' | 'male';

export interface AvatarEntry {
  path: string;
  label: string;
  role: AgentRole;
  gender: Gender;
}

export interface VoiceHint {
  lang: string;
  voiceId?: string;
  voiceIndex?: number;
  rate: number;
  pitch: number;
}

// ── Raw file listings ────────────────────────────────────────────────────────

const FEMALE_FILES = [
  'Amaya.svg', 'Assistant.svg', 'Assistant1.svg', 'assistant4.png',
  'Dr Ruth.png', 'Prof_Naa.png', 'teacher_lady.jpg',
];

const MALE_FILES = [
  'Adrian.svg', 'Assistant2.svg', 'Avery.svg', 'Brian.svg',
  'Brooklynn.svg', 'Cultist.svg', 'Foster.svg', 'Kwame_Male.svg',
  'professor.png', 'Prof_Demir.png', 'teacher.png',
];

function inferRole(filename: string): AgentRole {
  const lower = filename.toLowerCase();
  if (/assistant/i.test(lower)) return 'assistant';
  if (/prof|professor|dr\b|teacher/i.test(lower)) return 'teacher';
  return 'student';
}

function buildEntries(files: string[], gender: Gender): AvatarEntry[] {
  return files.map((file) => ({
    path: `/avatars/${gender === 'female' ? 'females' : 'males'}/${file}`,
    label: file.replace(/\.\w+$/, ''),
    role: inferRole(file),
    gender,
  }));
}

const ALL_AVATARS: AvatarEntry[] = [
  ...buildEntries(FEMALE_FILES, 'female'),
  ...buildEntries(MALE_FILES, 'male'),
];

const AVATARS_BY_ROLE: Record<AgentRole, AvatarEntry[]> = {
  teacher: ALL_AVATARS.filter((a) => a.role === 'teacher'),
  assistant: ALL_AVATARS.filter((a) => a.role === 'assistant'),
  student: ALL_AVATARS.filter((a) => a.role === 'student'),
};

// ── Voice hints by gender × role ─────────────────────────────────────────────

const VOICE_HINTS: Record<Gender, Record<AgentRole, VoiceHint>> = {
  female: {
    teacher:   { lang: 'en-US', voiceId: 'female-teacher', voiceIndex: 0, rate: 0.9,  pitch: 1.1 },
    assistant: { lang: 'en-US', voiceId: 'female-assistant', voiceIndex: 1, rate: 1.0,  pitch: 1.15 },
    student:   { lang: 'en-US', voiceId: 'female-student', voiceIndex: 2, rate: 1.05, pitch: 1.25 },
  },
  male: {
    teacher:   { lang: 'en-US', voiceId: 'male-teacher', voiceIndex: 3, rate: 0.88, pitch: 0.85 },
    assistant: { lang: 'en-US', voiceId: 'male-assistant', voiceIndex: 4, rate: 0.95, pitch: 0.9 },
    student:   { lang: 'en-US', voiceId: 'male-student', voiceIndex: 5, rate: 1.05, pitch: 0.95 },
  },
};

export function getVoiceHint(gender: Gender, role: AgentRole): VoiceHint {
  return VOICE_HINTS[gender][role];
}

export function pickAvatar(role: AgentRole, index: number, preferredGender?: Gender): AvatarEntry {
  let pool = AVATARS_BY_ROLE[role];
  if (preferredGender) {
    const genderPool = pool.filter((a) => a.gender === preferredGender);
    if (genderPool.length > 0) pool = genderPool;
  }
  if (pool.length === 0) pool = AVATARS_BY_ROLE.student;
  if (pool.length === 0) pool = ALL_AVATARS;
  return pool[index % pool.length];
}

export function inferGenderFromName(name: string): Gender {
  const femaleIndicators = [
    'ms', 'mrs', 'miss', 'dr ruth', 'naa', 'maya', 'emily',
    'amaya', 'sarah', 'anna', 'ella', 'emma', 'lady', 'anya', 'sharma',
  ];
  const lower = name.toLowerCase();
  if (femaleIndicators.some((f) => lower.includes(f))) return 'female';
  return 'male';
}

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return hash;
}

export function getFallbackAvatar(name: string, role: AgentRole = 'student'): string {
  const gender = inferGenderFromName(name);
  const entry = pickAvatar(role, Math.abs(hashString(name)), gender);
  return entry.path;
}

/** Pre-assigned avatars for the 4 default agents */
export const DEFAULT_AGENT_AVATARS: Record<string, { path: string; gender: Gender; role: AgentRole }> = {
  'agent-1': { path: '/avatars/females/teacher_lady.jpg', gender: 'female', role: 'teacher' },
  'agent-2': { path: '/avatars/females/Assistant.svg', gender: 'female', role: 'assistant' },
  'agent-3': { path: '/avatars/males/Brian.svg', gender: 'male', role: 'student' },
  'agent-4': { path: '/avatars/males/Adrian.svg', gender: 'male', role: 'student' },
};
