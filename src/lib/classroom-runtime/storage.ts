import type { PlaybackEngineState } from '@/lib/playback/types';
import { createEmptyWhiteboard } from '@/lib/whiteboard/reducer';
import type { ClassroomRuntimeSnapshot } from './types';

const STORAGE_PREFIX = 'neurospace:classroom-runtime:';
const SNAPSHOT_VERSION = 1 as const;

interface StoredPlaybackState extends Omit<PlaybackEngineState, 'revealedSectionIds'> {
  revealedSectionIds: string[];
}

interface StoredRuntimeSnapshot
  extends Omit<ClassroomRuntimeSnapshot, 'playbackState'> {
  playbackState: StoredPlaybackState | null;
}

function storageKey(classroomId: string): string {
  return `${STORAGE_PREFIX}${classroomId}`;
}

function serializePlaybackState(
  playbackState: PlaybackEngineState | null,
): StoredPlaybackState | null {
  if (!playbackState) return null;
  return {
    ...playbackState,
    revealedSectionIds: [...playbackState.revealedSectionIds],
  };
}

function deserializePlaybackState(
  playbackState: StoredPlaybackState | null,
): PlaybackEngineState | null {
  if (!playbackState) return null;
  return {
    ...playbackState,
    revealedSectionIds: new Set(playbackState.revealedSectionIds),
  };
}

export function createDefaultClassroomRuntimeSnapshot(
  classroomId: string,
): ClassroomRuntimeSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    classroomId,
    playbackState: null,
    whiteboardState: createEmptyWhiteboard(),
    chatMessages: [],
    discussionRoom: null,
    notesOpen: true,
    showRevealModal: false,
    revealPending: false,
    updatedAt: Date.now(),
  };
}

export function loadClassroomRuntimeSnapshot(
  classroomId: string,
): ClassroomRuntimeSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(classroomId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredRuntimeSnapshot>;
    if (parsed.version !== SNAPSHOT_VERSION) return null;

    return {
      ...createDefaultClassroomRuntimeSnapshot(classroomId),
      ...parsed,
      classroomId,
      playbackState: deserializePlaybackState(parsed.playbackState ?? null),
      whiteboardState: parsed.whiteboardState ?? createEmptyWhiteboard(),
      chatMessages: Array.isArray(parsed.chatMessages) ? parsed.chatMessages : [],
      discussionRoom: parsed.discussionRoom ?? null,
      notesOpen: parsed.notesOpen ?? true,
      showRevealModal: parsed.showRevealModal ?? false,
      revealPending: parsed.revealPending ?? false,
      updatedAt: parsed.updatedAt ?? Date.now(),
      version: SNAPSHOT_VERSION,
    };
  } catch {
    return null;
  }
}

export function saveClassroomRuntimeSnapshot(
  snapshot: ClassroomRuntimeSnapshot,
): void {
  if (typeof window === 'undefined') return;

  const stored: StoredRuntimeSnapshot = {
    ...snapshot,
    version: SNAPSHOT_VERSION,
    playbackState: serializePlaybackState(snapshot.playbackState),
    updatedAt: Date.now(),
  };

  try {
    window.localStorage.setItem(storageKey(snapshot.classroomId), JSON.stringify(stored));
  } catch {
    // Ignore storage quota / serialization errors — runtime remains functional.
  }
}

export function clearClassroomRuntimeSnapshot(classroomId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey(classroomId));
  } catch {
    // Ignore storage errors.
  }
}