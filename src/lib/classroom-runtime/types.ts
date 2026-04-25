import type { PlaybackEngineState } from '@/lib/playback/types';
import type { WhiteboardState } from '@/lib/whiteboard/types';

export interface ClassroomChatMessage {
  id: string;
  type: 'user' | 'agent' | 'thinking' | 'system';
  text: string;
  agentId?: string;
  agentName?: string;
  agentRole?: 'teacher' | 'assistant' | 'student';
  agentColor?: string;
  agentAvatar?: string;
  timestamp: number;
}

export interface ClassroomDiscussionRoom {
  topic: string;
  prompt?: string;
}

export interface ClassroomRuntimeSnapshot {
  version: 1;
  classroomId: string;
  playbackState: PlaybackEngineState | null;
  whiteboardState: WhiteboardState;
  chatMessages: ClassroomChatMessage[];
  discussionRoom: ClassroomDiscussionRoom | null;
  notesOpen: boolean;
  showRevealModal: boolean;
  revealPending: boolean;
  updatedAt: number;
}