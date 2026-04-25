import { useSyncExternalStore } from 'react';
import type { PlaybackEngineState } from '@/lib/playback/types';
import type { WhiteboardState } from '@/lib/whiteboard/types';
import {
  clearClassroomRuntimeSnapshot,
  createDefaultClassroomRuntimeSnapshot,
  loadClassroomRuntimeSnapshot,
  saveClassroomRuntimeSnapshot,
} from './storage';
import type {
  ClassroomChatMessage,
  ClassroomDiscussionRoom,
  ClassroomRuntimeSnapshot,
} from './types';

type Listener = () => void;

interface ClassroomRuntimeStoreState {
  snapshots: Record<string, ClassroomRuntimeSnapshot>;
}

function cloneSnapshot(snapshot: ClassroomRuntimeSnapshot): ClassroomRuntimeSnapshot {
  return {
    ...snapshot,
    playbackState: snapshot.playbackState
      ? {
          ...snapshot.playbackState,
          revealedSectionIds: new Set(snapshot.playbackState.revealedSectionIds),
        }
      : null,
    whiteboardState: {
      ...snapshot.whiteboardState,
      elements: JSON.parse(JSON.stringify(snapshot.whiteboardState.elements)),
    },
    chatMessages: snapshot.chatMessages.map((msg) => ({ ...msg })),
    discussionRoom: snapshot.discussionRoom ? { ...snapshot.discussionRoom } : null,
  };
}

function clonePlaybackState(
  playbackState: PlaybackEngineState | null,
): PlaybackEngineState | null {
  if (!playbackState) return null;
  return {
    ...playbackState,
    revealedSectionIds: new Set(playbackState.revealedSectionIds),
  };
}

function cloneWhiteboardState(state: WhiteboardState): WhiteboardState {
  return {
    ...state,
    elements: JSON.parse(JSON.stringify(state.elements)),
  };
}

class ClassroomRuntimeStore {
  private state: ClassroomRuntimeStoreState = { snapshots: {} };

  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  private setSnapshot(snapshot: ClassroomRuntimeSnapshot): void {
    this.state = {
      snapshots: {
        ...this.state.snapshots,
        [snapshot.classroomId]: snapshot,
      },
    };
    saveClassroomRuntimeSnapshot(snapshot);
    this.emit();
  }

  hydrate(classroomId: string | null): ClassroomRuntimeSnapshot | null {
    if (!classroomId) return null;
    const existing = this.state.snapshots[classroomId];
    if (existing) return cloneSnapshot(existing);

    const loaded = loadClassroomRuntimeSnapshot(classroomId)
      ?? createDefaultClassroomRuntimeSnapshot(classroomId);
    this.state = {
      snapshots: {
        ...this.state.snapshots,
        [classroomId]: loaded,
      },
    };
    this.emit();
    return cloneSnapshot(loaded);
  }

  getSnapshot(classroomId: string | null): ClassroomRuntimeSnapshot | null {
    if (!classroomId) return null;
    const snapshot = this.state.snapshots[classroomId] ?? this.hydrate(classroomId);
    return snapshot ? cloneSnapshot(snapshot) : null;
  }

  update(
    classroomId: string,
    patch:
      | Partial<ClassroomRuntimeSnapshot>
      | ((current: ClassroomRuntimeSnapshot) => Partial<ClassroomRuntimeSnapshot>),
  ): ClassroomRuntimeSnapshot {
    const current = this.state.snapshots[classroomId]
      ?? loadClassroomRuntimeSnapshot(classroomId)
      ?? createDefaultClassroomRuntimeSnapshot(classroomId);

    const resolvedPatch = typeof patch === 'function' ? patch(cloneSnapshot(current)) : patch;
    const next: ClassroomRuntimeSnapshot = {
      ...current,
      ...resolvedPatch,
      classroomId,
      playbackState: resolvedPatch.playbackState !== undefined
        ? clonePlaybackState(resolvedPatch.playbackState)
        : clonePlaybackState(current.playbackState),
      whiteboardState: resolvedPatch.whiteboardState !== undefined
        ? cloneWhiteboardState(resolvedPatch.whiteboardState)
        : cloneWhiteboardState(current.whiteboardState),
      chatMessages: resolvedPatch.chatMessages !== undefined
        ? resolvedPatch.chatMessages.map((msg) => ({ ...msg }))
        : current.chatMessages.map((msg) => ({ ...msg })),
      discussionRoom: resolvedPatch.discussionRoom !== undefined
        ? (resolvedPatch.discussionRoom ? { ...resolvedPatch.discussionRoom } : null)
        : (current.discussionRoom ? { ...current.discussionRoom } : null),
      updatedAt: Date.now(),
      version: 1,
    };

    this.setSnapshot(next);
    return cloneSnapshot(next);
  }

  setPlaybackState(classroomId: string, playbackState: PlaybackEngineState | null): void {
    this.update(classroomId, { playbackState });
  }

  setWhiteboardState(classroomId: string, whiteboardState: WhiteboardState): void {
    this.update(classroomId, { whiteboardState });
  }

  setChatMessages(classroomId: string, chatMessages: ClassroomChatMessage[]): void {
    this.update(classroomId, { chatMessages });
  }

  addChatMessage(classroomId: string, chatMessage: ClassroomChatMessage): void {
    this.update(classroomId, (current) => ({
      chatMessages: [...current.chatMessages, chatMessage],
    }));
  }

  setDiscussionRoom(classroomId: string, discussionRoom: ClassroomDiscussionRoom | null): void {
    this.update(classroomId, { discussionRoom });
  }

  setNotesOpen(classroomId: string, notesOpen: boolean): void {
    this.update(classroomId, { notesOpen });
  }

  setRevealState(
    classroomId: string,
    state: Pick<ClassroomRuntimeSnapshot, 'showRevealModal' | 'revealPending'>,
  ): void {
    this.update(classroomId, state);
  }

  reset(classroomId: string): void {
    this.setSnapshot(createDefaultClassroomRuntimeSnapshot(classroomId));
  }

  clearPersisted(classroomId: string): void {
    const { [classroomId]: _removed, ...rest } = this.state.snapshots;
    this.state = { snapshots: rest };
    clearClassroomRuntimeSnapshot(classroomId);
    this.emit();
  }
}

export const classroomRuntimeStore = new ClassroomRuntimeStore();

export function useClassroomRuntimeSnapshot(
  classroomId: string | null,
): ClassroomRuntimeSnapshot | null {
  return useSyncExternalStore(
    classroomRuntimeStore.subscribe,
    () => classroomRuntimeStore.getSnapshot(classroomId),
    () => null,
  );
}

export type {
  ClassroomChatMessage,
  ClassroomDiscussionRoom,
  ClassroomRuntimeSnapshot,
} from './types';