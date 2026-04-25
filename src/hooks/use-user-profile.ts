/**
 * useUserProfile — Persisted user profile (nickname, bio, avatar).
 *
 * Stored in localStorage under "ns_user_profile".
 */

import { useState, useCallback, useEffect } from 'react';

// ==================== Constants ====================

export const AVATAR_OPTIONS = [
  '/avatars/user.png',
  '/avatars/teacher-2.png',
  '/avatars/assist-2.png',
  '/avatars/clown-2.png',
  '/avatars/curious-2.png',
  '/avatars/note-taker-2.png',
  '/avatars/thinker-2.png',
] as const;

export type AvatarOption = (typeof AVATAR_OPTIONS)[number];

const STORAGE_KEY = 'ns_user_profile';

// ==================== Types ====================

export interface UserProfile {
  avatar: string;
  nickname: string;
  bio: string;
}

const DEFAULT_PROFILE: UserProfile = {
  avatar: AVATAR_OPTIONS[0],
  nickname: '',
  bio: '',
};

// ==================== Storage helpers ====================

function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) } as UserProfile;
  } catch {
    return DEFAULT_PROFILE;
  }
}

function saveProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    console.warn('[useUserProfile] localStorage write failed');
  }
}

// ==================== Hook ====================

export function useUserProfile() {
  const [profile, setProfileState] = useState<UserProfile>(loadProfile);

  // Sync across tabs
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        setProfileState(loadProfile());
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfileState((prev) => {
      const next = { ...prev, ...updates };
      saveProfile(next);
      return next;
    });
  }, []);

  const setAvatar   = useCallback((avatar: string)   => setProfile({ avatar }),   [setProfile]);
  const setNickname = useCallback((nickname: string) => setProfile({ nickname }), [setProfile]);
  const setBio      = useCallback((bio: string)      => setProfile({ bio }),      [setProfile]);

  const resetProfile = useCallback(() => {
    setProfileState(DEFAULT_PROFILE);
    saveProfile(DEFAULT_PROFILE);
  }, []);

  return {
    ...profile,
    setAvatar,
    setNickname,
    setBio,
    resetProfile,
    /** Quick check — returns true when nickname has been set */
    hasProfile: profile.nickname.trim().length > 0,
  };
}
