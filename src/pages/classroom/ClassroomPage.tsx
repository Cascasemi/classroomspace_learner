import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import type { DiscussionAgentResponse } from '@/lib/api';
import { PlaybackEngine } from '@/lib/playback/engine';
import { speakText, stopTTS, resolveVoiceHint, setLessonTTSActive } from '@/lib/audio/tts';
import { useBrowserASR } from '@/lib/audio/use-browser-asr';
import { useAudioRecorder } from '@/lib/hooks/use-audio-recorder';
import { useDiscussionTTS } from '@/hooks/use-discussion-tts';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useAuth } from '@/contexts/AuthContext';
import { exportClassroomToPptx } from '@/lib/export/export-pptx';
import {
  classroomRuntimeStore,
  type ClassroomChatMessage as ChatMessage,
  type ClassroomDiscussionRoom,
} from '@/lib/classroom-runtime/store';
import Whiteboard from '@/components/classroom/Whiteboard';
import { applyWBAction, createEmptyWhiteboard } from '@/lib/whiteboard/reducer';
import type { WhiteboardState, WBAction, WBActionName, WBElement } from '@/lib/whiteboard/types';
import type {
  ClassroomData,
  Scene,
  PlaybackEngineState,
  LessonContent,
  QuizContent,
  AgentConfig,
} from '@/lib/playback/types';
import LessonRenderer from '@/components/classroom/LessonRenderer';
import type { MathCheckResult } from '@/components/classroom/MathPracticePanel';
import QuizRenderer from '@/components/classroom/QuizRenderer';
import PlaybackControls from '@/components/classroom/PlaybackControls';
import SceneNav from '@/components/classroom/SceneNav';
import ClassChatPanel from '@/components/classroom/ClassChatPanel';
import DiscussionRoomOverlay from '@/components/classroom/DiscussionRoomOverlay';
import ParticipantBar from '@/components/classroom/ParticipantBar';
import AgentRevealModal from '@/components/classroom/AgentRevealModal';
import GenerationProgressScreen from '@/components/classroom/GenerationProgressScreen';
import { Button } from '@/components/ui/button';
import { BookOpen, ArrowLeft, Loader2, AlertCircle, RefreshCcw, Download, HelpCircle, MessageCircle, ArrowRight } from 'lucide-react';

/**
 * Converts live whiteboard elements to a ledger-seed format the server's
 * DirectorEngine understands. Agents receive pre-existing board context so
 * they neither redraw existing content nor contradict it.
 */
function wbElementsToLedger(
  elements: WBElement[],
): Array<{ agentName: string; actionName: string; params: Record<string, unknown> }> {
  return elements.map((el) => {
    const { id: elementId, type, ...rest } = el;
    return {
      agentName: 'Lesson',
      actionName: `wb_draw_${type}`,
      params: { elementId, ...(rest as Record<string, unknown>) },
    };
  });
}

export default function ClassroomPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // User profile — used for personalised teaching in discuss prompts
  const { nickname: profileNickname, bio: profileBio, avatar: profileAvatarFallback } = useUserProfile();
  const { user: authUser } = useAuth();
  // Prefer the avatar set on the auth profile (DiceBear / uploaded); fall back to local profile pick
  const profileAvatar = authUser?.avatarUrl || profileAvatarFallback;

  const [classroom, setClassroom] = useState<ClassroomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);

  // Playback state
  const [pbState, setPbState] = useState<PlaybackEngineState | null>(null);
  const engineRef = useRef<PlaybackEngine | null>(null);
  // Guard to prevent post-unmount state updates / speech callbacks
  const mountedRef = useRef(true);
  // Live agent lookup for TTS voice resolution (ref to avoid stale closures)
  const agentMapRef = useRef<Map<string, AgentConfig>>(new Map());
  // Mic / ASR
  // Primary: Whisper via MediaRecorder → /api/transcription
  // Fallback: browser Web Speech API (if Whisper not configured on server)
  const [transcript, setTranscript] = useState<string | null>(null);
  // Remember if the server reported Whisper is not configured so we stop sending there
  const whisperUnavailableRef = useRef(false);

  const audioRecorder = useAudioRecorder({
    onTranscription: (text) => setTranscript(text),
    onError: (msg) => {
      if (msg.includes('Whisper not configured')) {
        whisperUnavailableRef.current = true;
      }
    },
  });

  const {
    isListening,
    interimTranscript,
    startListening,
    stopListening,
  } = useBrowserASR({
    continuous: false,
    interimResults: true,
    onTranscription: (text) => setTranscript(text),
  });

  // Live discussion state
  const [discussLoading, setDiscussLoading] = useState(false);
  /** When true the server emitted cue_user — show "your turn" pulse in ParticipantBar */
  const [awaitingStudentCue, setAwaitingStudentCue] = useState(false);
  const [discussResponses, setDiscussResponses] = useState<DiscussionAgentResponse[]>([]);
  const [activeDiscussAgent, setActiveDiscussAgent] = useState<AgentConfig | undefined>(undefined);
  // Whiteboard state — persists for the classroom session
  const [wbState, setWbState] = useState<WhiteboardState>(createEmptyWhiteboard());

  // Panel open/close (Notes + Chat)
  const [notesOpen, setNotesOpen] = useState(true);

  // Discussion Room state
  const [discussionRoom, setDiscussionRoom] = useState<{
    topic: string;
    prompt?: string;
  } | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isQaLoading, setIsQaLoading] = useState(false);
  // Ref mirror of isQaLoading — readable inside async closures where the
  // React state value would be stale due to closure capture.
  const isQaActiveRef = useRef(false);

  // Tracks which scene index we already triggered proactive engagement for
  const proactiveFiredForSceneRef = useRef<number>(-1);

  // ── Post-scene Q&A flow ──────────────────────────────────────────────────────
  /** When true, shows the "Any questions?" overlay over the slide */
  const [showPostScenePrompt, setShowPostScenePrompt] = useState(false);
  /** When true, user is in free-ask mode after choosing "Yes" at the prompt */
  const [postSceneQaMode, setPostSceneQaMode] = useState(false);
  /** Incrementing trigger that makes ClassChatPanel switch to its Chat tab */
  const [chatTabTrigger, setChatTabTrigger] = useState(0);
  /** Scene that needs to be marked complete + advanced after Q&A mode ends */
  const pendingSceneAdvanceRef = useRef<{ sceneId: string } | null>(null);

  // Helper to append a message — stable callback (no deps, uses updater form)
  const addChatMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setChatMessages((prev) => [
      ...prev,
      { ...msg, id: `${msg.type}-${Date.now()}-${Math.random().toString(36).slice(2)}`, timestamp: Date.now() },
    ]);
  }, []);

  // Agent reveal modal — shown once per classroom session on first load
  const [showRevealModal, setShowRevealModal] = useState(false);
  // Prevents classroom content from flashing before the reveal modal appears
  const [revealPending, setRevealPending] = useState(false);
  const revealFiredRef = useRef(false);
  const [runtimeHydrated, setRuntimeHydrated] = useState(false);

  // Multi-agent queued TTS — enqueues each agent response and handles per-agent voice
  const discussTTS = useDiscussionTTS({
    agents: classroom?.agentConfigs ?? [],
    speedMultiplier: pbState?.playbackSpeed ?? 1,
    onSpeakingAgent: (agentId) => {
      // Highlight the active agent avatar during discussion TTS playback
      if (agentId) {
        const agent = agentMapRef.current.get(agentId);
        setActiveDiscussAgent(agent);
      }
    },
  });
  // Stable ref so the cleanup effect doesn't depend on discussTTS identity
  const discussTTSRef = useRef(discussTTS);
  discussTTSRef.current = discussTTS;
  // Stable ref for handleLiveInterrupt — keeps the callback current inside initEngine's onSpeechRequest closure
  const handleLiveInterruptRef = useRef<((text: string) => Promise<void>) | null>(null);

  // Stop TTS, engine, and recording when component unmounts or navigates away
  useEffect(() => () => {
    mountedRef.current = false;
    // Clear the lesson-channel guard FIRST so that stopTTS() is not a no-op.
    // (lessonTTSActive prevents discussion code from cancelling lesson audio,
    //  but on unmount we always want a hard stop regardless of channel state.)
    setLessonTTSActive(false);
    // Stop the playback engine first — sets isStopped=true so no new speech
    // actions start, and fires onSpeechCancel which cancels browser TTS.
    engineRef.current?.stop();
    stopTTS();
    stopListening();
    audioRecorder.cancelRecording();
    discussTTSRef.current.cancel();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch classroom data
  const fetchClassroom = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.getClassroom(id);
      setClassroom(data as unknown as ClassroomData);

      if (data.status === 'ready' && !engineRef.current) {
        // First time reaching 'ready' — initialise the engine
        const classroomData = data as unknown as ClassroomData;
        initEngine(classroomData.scenes, data.progress, classroomData.agentConfigs);

        // Show agent reveal modal once per session (skip if already seen)
        const seenKey = `agentRevealSeen:${id}`;
        const agents = classroomData.agentConfigs ?? [];
        if (!revealFiredRef.current && agents.length > 0 && !sessionStorage.getItem(seenKey)) {
          revealFiredRef.current = true;
          sessionStorage.setItem(seenKey, '1');
          // Block classroom content render until the reveal modal is dismissed
          setRevealPending(true);
          setShowRevealModal(true);
        }
      } else if (data.status === 'ready' && engineRef.current) {
        // Engine already running — check if background generation has produced new scenes
        const classroomData = data as unknown as ClassroomData;
        const engineTotal = engineRef.current.getTotalScenes();
        const fetchedTotal = classroomData.scenes?.length ?? 0;
        if (fetchedTotal > engineTotal) {
          const newScenes = classroomData.scenes.slice(engineTotal);
          engineRef.current.appendScenes(newScenes);
        }
      }

      setLoading(false);
      return data.status;
    } catch (err) {
      setError('Failed to load classroom');
      setLoading(false);
      return 'error';
    }
  }, [id]);

  useEffect(() => {
    setRuntimeHydrated(false);

    if (!id) {
      setWbState(createEmptyWhiteboard());
      setChatMessages([]);
      setDiscussionRoom(null);
      setNotesOpen(true);
      setShowRevealModal(false);
      setRevealPending(false);
      setRuntimeHydrated(true);
      return;
    }

    const snapshot = classroomRuntimeStore.hydrate(id);
    setWbState(snapshot?.whiteboardState ?? createEmptyWhiteboard());
    setChatMessages(snapshot?.chatMessages ?? []);
    setDiscussionRoom((snapshot?.discussionRoom as ClassroomDiscussionRoom | null) ?? null);
    setNotesOpen(snapshot?.notesOpen ?? true);
    setShowRevealModal(snapshot?.showRevealModal ?? false);
    setRevealPending(snapshot?.revealPending ?? false);
    setRuntimeHydrated(true);
  }, [id]);

  useEffect(() => {
    if (!id || !runtimeHydrated) return;
    classroomRuntimeStore.update(id, {
      playbackState: pbState,
      whiteboardState: wbState,
      chatMessages,
      discussionRoom,
      notesOpen,
      showRevealModal,
      revealPending,
    });
  }, [
    id,
    runtimeHydrated,
    pbState,
    wbState,
    chatMessages,
    discussionRoom,
    notesOpen,
    showRevealModal,
    revealPending,
  ]);

  // Poll while generating OR while background scene generation is ongoing
  useEffect(() => {
    fetchClassroom();
  }, [fetchClassroom]);

  useEffect(() => {
    if (!classroom) return;
    // Keep polling if status is 'generating' OR if the classroom is 'ready' but
    // background scene generation hasn't finished yet
    const isGenerating = classroom.status === 'generating';
    const isBackgroundGen =
      classroom.status === 'ready' &&
      (classroom.generation?.scenesCompleted ?? 0) < (classroom.generation?.totalScenes ?? 0) &&
      (classroom.generation?.totalScenes ?? 0) > 0;
    // Also keep polling while image tasks are still pending/generating (e.g., after
    // a server restart that cleared the cache and reset tasks to 'pending').
    const hasPendingImages =
      classroom.status === 'ready' &&
      (classroom.mediaTasks ?? []).some(
        (t: { status: string }) => t.status === 'pending' || t.status === 'generating',
      );

    if (!isGenerating && !isBackgroundGen && !hasPendingImages) return;

    const timer = setInterval(async () => {
      const status = await fetchClassroom();
      setPollCount((p) => p + 1);
      if (status === 'error' || pollCount > 120) {
        clearInterval(timer);
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [classroom?.status, classroom?.generation?.scenesCompleted, classroom?.generation?.totalScenes, classroom?.mediaTasks, fetchClassroom, pollCount]);

  // Initialize playback engine
  function initEngine(
    scenes: Scene[],
    progress?: { currentSceneIndex: number; currentActionIndex: number },
    agentConfigs?: AgentConfig[],
  ) {
    const runtimeSnapshot = id ? classroomRuntimeStore.getSnapshot(id) : null;

    // Populate agent map for voice resolution in TTS callbacks
    const map = new Map<string, AgentConfig>();
    (agentConfigs ?? []).forEach((a) => map.set(a.id, a));
    agentMapRef.current = map;

    const engine = new PlaybackEngine(scenes, {
      onStateChange: (state) => setPbState({ ...state }),
      onSceneChange: (sceneIndex) => {
        // Save progress to server
        if (id) {
          api.updateClassroomProgress(id, { currentSceneIndex: sceneIndex, currentActionIndex: 0 }).catch(() => {});
        }
      },
      onComplete: () => {},
      // TTS bridge — speaks each line then signals the engine to advance
      onSpeechRequest: async (text, agentId, done) => {
        const agent = agentId ? agentMapRef.current.get(agentId) : undefined;
        const speed = engineRef.current?.getSpeed() ?? 1;
        const hint = resolveVoiceHint(agent?.role, {
          ...agent?.voiceHint,
          rate: (agent?.voiceHint?.rate ?? 1) * speed,
        });
        // Mark the lesson channel as active so discussion TTS cannot cancel
        // our chunk sequence mid-sentence via stopTTS() or its own speakText().
        setLessonTTSActive(true);
        try {
          await speakText(text, hint);
        } finally {
          setLessonTTSActive(false);
        }
        // Guard: if the page was unmounted while we were speaking, don't fire
        // the live-interrupt API call or update any state — just bail cleanly.
        if (!mountedRef.current) { done(); return; }
        // After each teacher speech: fire live interrupt check so assistant/student
        // can react in character before the engine advances to the next action.
        if (agent?.role === 'teacher') {
          await handleLiveInterruptRef.current?.(text);
        }
        done();
      },
      // Cancel speech on pause/skip/navigate
      onSpeechCancel: () => stopTTS(),
      // Convert flat-param WB actions from pre-generated lesson scenes into
      // the { name, params } shape expected by the whiteboard reducer.
      onWbAction: (action) => {
        const { type, id: _actionId, ...params } = action as unknown as Record<string, unknown>;
        setWbState((prev) =>
          applyWBAction(prev, { name: type as WBActionName, params: params as Record<string, unknown> }),
        );
      },
    });

    if (progress && progress.currentSceneIndex > 0) {
      engine.restoreProgress(progress.currentSceneIndex, progress.currentActionIndex);
    }

    const restoredSpeed = runtimeSnapshot?.playbackState?.playbackSpeed;
    if (restoredSpeed && restoredSpeed !== 1) {
      engine.setSpeed(restoredSpeed);
    }

    engineRef.current = engine;
    setPbState(engine.getState());
  }

  // Save progress periodically
  useEffect(() => {
    if (!id || !pbState) return;
    const timer = setInterval(() => {
      api.updateClassroomProgress(id, {
        currentSceneIndex: pbState.currentSceneIndex,
        currentActionIndex: pbState.currentActionIndex,
        timeSpentMs: 30000,
      }).catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [id, pbState?.currentSceneIndex, pbState?.currentActionIndex]);

  useEffect(() => {
    setWbState(createEmptyWhiteboard());
  }, [pbState?.currentSceneIndex]);

  // Mic toggle — prefer Whisper recording; fall back to browser ASR if server doesn't have Whisper
  function handleMicToggle() {
    const isActive = audioRecorder.isRecording || isListening;
    if (isActive) {
      audioRecorder.stopRecording();
      stopListening();
    } else {
      if (!whisperUnavailableRef.current && audioRecorder.isSupported) {
        audioRecorder.startRecording();
      } else {
        startListening();
      }
    }
  }

  // If a post-scene prompt was deferred because Q&A was active, show it now
  // that Q&A has finished. The modal fires on the isQaLoading false-edge only
  // when proactive engagement already set pendingSceneAdvanceRef.
  useEffect(() => {
    if (!isQaLoading && pendingSceneAdvanceRef.current && mountedRef.current && !showPostScenePrompt) {
      setShowPostScenePrompt(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQaLoading]);

  // Open Discussion Room when the engine fires a discussion action
  useEffect(() => {
    if (pbState?.discussionActive && pbState.discussionTopic) {
      stopTTS();
      discussTTS.cancel();
      setDiscussionRoom({ topic: pbState.discussionTopic, prompt: undefined });
    }
  // Only trigger on the discussionActive → true edge
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pbState?.discussionActive]);

  // Called when the user closes the Discussion Room → resume class
  function handleDiscussionRoomClose() {
    setDiscussionRoom(null);
    setActiveDiscussAgent(undefined);
    setDiscussResponses([]);
    setWbState(createEmptyWhiteboard());
    engineRef.current?.finishDiscussionAndNextScene();
  }

  // Send student message to agents and play their responses (SSE streaming version)
  // (legacy path — kept for direct handleContinueDiscussion calls)
  async function handleContinueDiscussion() {
    const topic = pbState?.discussionTopic;
    audioRecorder.stopRecording();
    stopListening();

    if (!topic || !id) {
      setDiscussResponses([]);
      setActiveDiscussAgent(undefined);
      setTranscript(null);
      engineRef.current?.dismissDiscussion();
      return;
    }

    const studentMessage = transcript || interimTranscript || undefined;
    const currentSceneForDiscuss = pbState ? classroom?.scenes[pbState.currentSceneIndex] : undefined;
    const sceneTitle = currentSceneForDiscuss?.title;
    const sceneType = currentSceneForDiscuss?.type === 'lesson' ? 'lesson' as const
      : currentSceneForDiscuss?.type === 'quiz' ? 'quiz' as const : undefined;
    const sceneSectionIds = currentSceneForDiscuss?.type === 'lesson' && currentSceneForDiscuss.content.type === 'lesson'
      ? currentSceneForDiscuss.content.sections.map((s) => s.id)
      : undefined;

    setAwaitingStudentCue(false); // clear any previous cue when a new round starts
    setDiscussLoading(true);
    setDiscussResponses([]);
    setActiveDiscussAgent(undefined);
    discussTTS.cancel(); // drain any leftover queue from a previous round

    let anySpeech = false;

    try {
      // api.discuss() now streams SSE — onAgentStart + onAgentResponse fire as each
      // agent completes, so the UI and TTS update progressively without waiting for all 3.
      await api.discuss({
        classroomId: id,
        discussionTopic: topic,
        sceneTitle,
        sceneType,
        sceneSectionIds,
        studentMessage,
        // ── Whiteboard context — agents see what's already on the board ──
        initialWbLedger: wbElementsToLedger(wbState.elements),
        // ── Personalised teaching (wired end-to-end) ──
        userProfile: {
          nickname: profileNickname || undefined,
          bio: profileBio || undefined,
        },
        // ── Progressive callbacks ──
        onAgentStart: (agentId) => {
          // Show thinking indicator for the agent that just started
          const agent = agentMap.get(agentId);
          setActiveDiscussAgent(agent);
        },
        onAgentResponse: (resp) => {
          const agent = agentMap.get(resp.agentId);
          setActiveDiscussAgent(agent);
          setDiscussResponses((prev) => [...prev, resp]);

          // Apply whiteboard actions immediately as they arrive
          if (resp.whiteboardActions && resp.whiteboardActions.length > 0) {
            setWbState((prev) => {
              let next = prev;
              for (const act of resp.whiteboardActions) {
                next = applyWBAction(next, act as WBAction);
              }
              return next;
            });
          }

          // Enqueue TTS — discussion hook handles per-agent voice + serialisation
          if (resp.speech) {
            anySpeech = true;
            discussTTS.enqueue({ agentId: resp.agentId, text: resp.speech });
          }
        },
        // ── cue_user — server signals it's the student's turn ──
        onCueUser: () => { setAwaitingStudentCue(true); },
      });

      setDiscussLoading(false);

      // Wait for all agent TTS to finish before dismissing the discussion.
      // Resolves on the actual drain signal (event-driven); 30s is a hard cap
      // that only fires if TTS fails silently and onend never arrives.
      if (anySpeech) {
        await discussTTS.waitForEmpty(30_000);
      }
    } catch (err) {
      console.warn('[discuss]', err);
      setDiscussLoading(false);
    }

    discussTTS.cancel();
    setActiveDiscussAgent(undefined);
    setAwaitingStudentCue(false);
    setDiscussResponses([]);
    setTranscript(null);
    engineRef.current?.dismissDiscussion();
  }

  // ── Mid-lecture Q&A — user asks a question in the chat panel ──────────────
  const handleAskQuestion = useCallback(async (question: string) => {
    if (!id || !classroom || isQaLoading) return;

    const wasPlaying = engineRef.current?.getState().playbackState === 'playing';
    if (wasPlaying) engineRef.current?.pause();

    // Capture voice state so ASR doesn't keep capturing during Q&A
    audioRecorder.stopRecording();
    stopListening();

    addChatMessage({ type: 'user', text: question });

    setIsQaLoading(true);
    discussTTS.cancel();
    setDiscussResponses([]);  // clear for ParticipantBar feed

    const currentSceneForAsk = classroom.scenes[engineRef.current?.getState().currentSceneIndex ?? 0];
    const sceneTitle = currentSceneForAsk?.title;
    const sceneTypeForAsk = currentSceneForAsk?.type === 'lesson' ? 'lesson' as const
      : currentSceneForAsk?.type === 'quiz' ? 'quiz' as const : undefined;
    const sceneSectionIdsForAsk = currentSceneForAsk?.type === 'lesson' && currentSceneForAsk.content.type === 'lesson'
      ? currentSceneForAsk.content.sections.map((s) => s.id)
      : undefined;
    let anySpeech = false;

    try {
      await api.askQuestion({
        classroomId: id,
        question,
        sceneTitle,
        sceneType: sceneTypeForAsk,
        sceneSectionIds: sceneSectionIdsForAsk,
        initialWbLedger: wbElementsToLedger(wbState.elements),
        userProfile: {
          nickname: profileNickname || undefined,
          bio: profileBio || undefined,
        },
        onAgentStart: (agentId) => {
          const agent = agentMapRef.current.get(agentId);
          setActiveDiscussAgent(agent);
        },
        onAgentResponse: (resp) => {
          const agent = agentMapRef.current.get(resp.agentId);
          setActiveDiscussAgent(agent);
          setDiscussResponses((prev) => [...prev, resp]); // feeds ParticipantBar

          addChatMessage({
            type: 'agent',
            text: resp.speech,
            agentId: resp.agentId,
            agentName: resp.agentName,
            agentRole: resp.agentRole as ChatMessage['agentRole'],
            agentColor: agent?.color,
            agentAvatar: agent?.avatar,
          });

          // Apply any whiteboard actions from the agent
          if (resp.whiteboardActions && resp.whiteboardActions.length > 0) {
            setWbState((prev) => {
              let next = prev;
              for (const act of resp.whiteboardActions) {
                next = applyWBAction(next, act as WBAction);
              }
              return next;
            });
          }

          if (resp.speech) {
            anySpeech = true;
            discussTTS.enqueue({ agentId: resp.agentId, text: resp.speech });
          }
        },
      });

      setIsQaLoading(false);
      isQaActiveRef.current = false;

      // Wait for all agent TTS to drain before resuming lesson playback.
      // Resolves on the actual drain signal (event-driven); 30s hard cap.
      if (anySpeech) {
        await discussTTS.waitForEmpty(30_000);
      }
    } catch (err) {
      console.warn('[qa]', err);
      setIsQaLoading(false);
      isQaActiveRef.current = false;
      discussTTS.cancel();
    }

    setActiveDiscussAgent(undefined);
    setDiscussResponses([]);
    setTranscript(null);

    addChatMessage({ type: 'system', text: '↩ Class resuming…' });

    if (wasPlaying) engineRef.current?.resume();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, classroom, isQaLoading, profileNickname, profileBio, addChatMessage]);

  // ── Mark a scene as completed — updates server + local classroom state ─────
  const markSceneCompleted = useCallback((sceneId: string) => {
    if (!id) return;
    api.updateClassroomProgress(id, { completedSceneId: sceneId }).catch(() => {});
    setClassroom((prev) => {
      if (!prev) return prev;
      if (prev.progress?.completedScenes?.includes(sceneId)) return prev;
      return {
        ...prev,
        progress: {
          ...prev.progress,
          completedScenes: [...(prev.progress?.completedScenes ?? []), sceneId],
        },
      };
    });
  }, [id]);

  /** Mark current scene complete + move engine to next scene */
  const handleNextScene = useCallback(() => {
    if (!engineRef.current || !classroom) return;
    const currentIdx = engineRef.current.getState().currentSceneIndex;
    const scene = classroom.scenes[currentIdx];
    if (scene) markSceneCompleted(scene.id);
    engineRef.current.nextScene();
  }, [markSceneCompleted, classroom]);

  // ── Live agent interrupt — fires after each teacher speech block ──────────────
  // Non-teacher agents (assistant/student) decide whether to react.
  // If a student/assistant asks a question, the teacher answers before the engine advances.
  const handleLiveInterrupt = useCallback(async (teacherSpeech: string) => {
    if (!id || !classroom || isQaActiveRef.current) return;
    // Only fire during lesson scenes — quiz scenes have no teacher narration
    const sceneIdx = engineRef.current?.getState().currentSceneIndex ?? 0;
    const scene = classroom.scenes[sceneIdx];
    if (!scene || scene.type !== 'lesson') return;

    // Collect each agent's speech so we can detect unanswered questions
    const capturedResponses: Array<{ agentRole: string; agentId: string; agentName: string; speech: string }> = [];

    try {
      await api.interrupt({
        classroomId: id,
        teacherSpeech,
        sceneTitle: scene.title,
        userProfile: {
          nickname: profileNickname || undefined,
          bio: profileBio || undefined,
        },
        onAgentStart: (agentId) => {
          const agent = agentMapRef.current.get(agentId);
          setActiveDiscussAgent(agent);
        },
        onAgentResponse: (resp) => {
          if (!resp.speech) return;
          capturedResponses.push(resp);
          const agent = agentMapRef.current.get(resp.agentId);
          setActiveDiscussAgent(agent);
          addChatMessage({
            type: 'agent',
            text: resp.speech,
            agentId: resp.agentId,
            agentName: resp.agentName,
            agentRole: resp.agentRole as ChatMessage['agentRole'],
            agentColor: agent?.color,
            agentAvatar: agent?.avatar,
          });
          // Queue for TTS playback — handled serially by the discussion-TTS hook
          discussTTSRef.current.enqueue({ agentId: resp.agentId, text: resp.speech });
        },
      });

      // Wait for all agent TTS to drain before checking for follow-up questions.
      // Resolves on the actual drain signal (event-driven); 30s hard cap.
      await discussTTSRef.current.waitForEmpty(30_000);

      // ── Teacher follow-up on student/assistant questions ────────────────────
      // If any non-teacher agent ended with a question, call the teacher to answer
      // before the engine increments to the next action.
      const firstQuestion = capturedResponses.find(
        (r) => r.agentRole !== 'teacher' && r.speech.includes('?'),
      );
      if (firstQuestion && mountedRef.current) {
        try {
          await api.discuss({
            classroomId: id,
            targetRoles: ['teacher'],
            discussionTopic:
              `${firstQuestion.agentName} just asked: "${firstQuestion.speech}" — please answer this question directly and clearly for the class before moving on.`,
            sceneTitle: scene.title,
            studentMessage: firstQuestion.speech,
            userProfile: { nickname: profileNickname || undefined, bio: profileBio || undefined },
            onAgentStart: (agentId) => {
              const agent = agentMapRef.current.get(agentId);
              setActiveDiscussAgent(agent);
            },
            onAgentResponse: (resp) => {
              if (!resp.speech) return;
              const agent = agentMapRef.current.get(resp.agentId);
              setActiveDiscussAgent(agent);
              addChatMessage({
                type: 'agent',
                text: resp.speech,
                agentId: resp.agentId,
                agentName: resp.agentName,
                agentRole: resp.agentRole as ChatMessage['agentRole'],
                agentColor: agent?.color,
                agentAvatar: agent?.avatar,
              });
              discussTTSRef.current.enqueue({ agentId: resp.agentId, text: resp.speech });
            },
          });
          await discussTTSRef.current.waitForEmpty(30_000);
        } catch (err) {
          console.warn('[interrupt-teacher-reply]', err);
        }
      }
    } catch (err) {
      console.warn('[interrupt]', err);
    }
    setActiveDiscussAgent(undefined);
  }, [id, classroom, isQaLoading, profileNickname, profileBio, addChatMessage]);

  // Keep the ref current so initEngine's onSpeechRequest always calls the latest version
  handleLiveInterruptRef.current = handleLiveInterrupt;

  // ── Post-scene Q&A handlers ──────────────────────────────────────────────────

  /** User taps "Yes, I have a question" — open chat for free-ask mode */
  const handlePostSceneYes = useCallback(() => {
    setShowPostScenePrompt(false);
    setPostSceneQaMode(true);
    setNotesOpen(true);
    // Trigger ClassChatPanel to switch to Chat tab
    setChatTabTrigger((t) => t + 1);
    addChatMessage({
      type: 'system',
      text: '💬 Go ahead — ask anything about this slide. Click "Continue →" when you\'re done.',
    });
  }, [addChatMessage]);

  /** User taps "No, continue to next slide" from the prompt */
  const handlePostSceneNo = useCallback(() => {
    setShowPostScenePrompt(false);
    const pending = pendingSceneAdvanceRef.current;
    if (pending) {
      markSceneCompleted(pending.sceneId);
      engineRef.current?.nextScene();
      pendingSceneAdvanceRef.current = null;
    }
    setPostSceneQaMode(false);
  }, [markSceneCompleted]);

  /** User taps "Continue →" from the post-scene Q&A banner — advance to next scene */
  const handlePostSceneContinue = useCallback(() => {
    setPostSceneQaMode(false);
    const pending = pendingSceneAdvanceRef.current;
    if (pending) {
      markSceneCompleted(pending.sceneId);
      engineRef.current?.nextScene();
      pendingSceneAdvanceRef.current = null;
    }
  }, [markSceneCompleted]);

  // ── Proactive engagement — agents briefly discuss at end of each lesson scene ──
  const handleProactiveEngagement = useCallback(async (sceneIdx: number) => {
    if (!id || !classroom) return;
    const scene = classroom.scenes[sceneIdx];
    // Only trigger for lesson scenes — quiz scenes wait for the user to finish
    if (!scene || scene.type !== 'lesson') return;

    // Prevent double-fire for the same scene
    if (proactiveFiredForSceneRef.current === sceneIdx) return;
    proactiveFiredForSceneRef.current = sceneIdx;

    setIsQaLoading(true);
    isQaActiveRef.current = true;
    addChatMessage({ type: 'system', text: `Agents reacting to: ${scene.title}` });
    discussTTS.cancel();

    let anySpeech = false;
    // Collect responses to detect unanswered student questions
    const proactiveResponses: Array<{
      agentRole: string; agentId: string; agentName: string; speech: string;
    }> = [];

    try {
      await api.discuss({
        classroomId: id,
        discussionTopic: `We just finished the slide "${scene.title}". Based on your role:
– Teacher: ask one short engaging question that makes students think about this material. Own the room.
– Assistant: add one brief reinforcing note or analogy (max 40 words).
– Student: react authentically in 1-2 sentences — ask a follow-up or say what clicked.
Keep the whole exchange under 90 seconds total.`,
        sceneTitle: scene.title,
        userProfile: {
          nickname: profileNickname || undefined,
          bio: profileBio || undefined,
        },
        onAgentStart: (agentId) => {
          const agent = agentMapRef.current.get(agentId);
          setActiveDiscussAgent(agent);
        },
        onAgentResponse: (resp) => {
          const agent = agentMapRef.current.get(resp.agentId);
          setActiveDiscussAgent(agent);

          if (resp.speech) {
            anySpeech = true;
            proactiveResponses.push(resp);
            addChatMessage({
              type: 'agent',
              text: resp.speech,
              agentId: resp.agentId,
              agentName: resp.agentName,
              agentRole: resp.agentRole as ChatMessage['agentRole'],
              agentColor: agent?.color,
              agentAvatar: agent?.avatar,
            });
            discussTTS.enqueue({ agentId: resp.agentId, text: resp.speech });
          }

          if (resp.whiteboardActions?.length) {
            setWbState((prev) => {
              let next = prev;
              for (const act of resp.whiteboardActions) next = applyWBAction(next, act as WBAction);
              return next;
            });
          }
        },
      });

      setIsQaLoading(false);
      isQaActiveRef.current = false;
      if (anySpeech) await discussTTS.waitForEmpty(30_000);

      // ── Teacher follow-up on student questions ──────────────────────────────
      // If a student or assistant ended with a question, loop back to the teacher
      // to answer it before we show the "any questions?" prompt to the human.
      const studentQuestion = proactiveResponses.find(
        (r) => r.agentRole !== 'teacher' && r.speech.includes('?'),
      );
      if (studentQuestion && mountedRef.current) {
        try {
          await api.discuss({
            classroomId: id,
            targetRoles: ['teacher'],
            discussionTopic:
              `${studentQuestion.agentName} asked: "${studentQuestion.speech}" — please answer this question clearly and concisely before we move on.`,
            sceneTitle: scene.title,
            studentMessage: studentQuestion.speech,
            userProfile: { nickname: profileNickname || undefined, bio: profileBio || undefined },
            onAgentStart: (agentId) => {
              const agent = agentMapRef.current.get(agentId);
              setActiveDiscussAgent(agent);
            },
            onAgentResponse: (resp) => {
              if (!resp.speech) return;
              anySpeech = true;
              const agent = agentMapRef.current.get(resp.agentId);
              setActiveDiscussAgent(agent);
              addChatMessage({
                type: 'agent',
                text: resp.speech,
                agentId: resp.agentId,
                agentName: resp.agentName,
                agentRole: resp.agentRole as ChatMessage['agentRole'],
                agentColor: agent?.color,
                agentAvatar: agent?.avatar,
              });
              discussTTS.enqueue({ agentId: resp.agentId, text: resp.speech });
            },
          });
          if (anySpeech) await discussTTS.waitForEmpty(30_000);
        } catch (err) {
          console.warn('[proactive-teacher-reply]', err);
        }
      }
    } catch (err) {
      console.warn('[proactive]', err);
      setIsQaLoading(false);
      isQaActiveRef.current = false;
      discussTTS.cancel();
    }

    setActiveDiscussAgent(undefined);

    // ── "Any questions?" prompt — never auto-advance after proactive engagement ──
    // Store the pending advance. Only show the modal immediately if no user
    // Q&A is currently in flight. If Q&A is active, the useEffect below will
    // show it once isQaLoading returns to false.
    if (mountedRef.current) {
      pendingSceneAdvanceRef.current = { sceneId: scene.id };
      if (!isQaActiveRef.current) setShowPostScenePrompt(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, classroom, addChatMessage, markSceneCompleted, profileNickname, profileBio]);


  async function handleQuizSubmit(answers: Record<string, string[]>) {
    if (!id || !classroom || !pbState) return;
    const scene = classroom.scenes[pbState.currentSceneIndex];
    if (!scene || scene.type !== 'quiz') return;

    try {
      await api.submitQuiz(id, { sceneId: scene.id, answers });
    } catch {
      // silently fail
    }

    // Mark quiz scene completed and advance to next
    markSceneCompleted(scene.id);
    engineRef.current?.nextScene();
  }

  // ── Math practice result — animates step-by-step whiteboard solution ────
  const handleMathPracticeResult = useCallback(async (result: MathCheckResult) => {
    if (result.correct || !result.steps?.length) return;
    const teacherAgent = (classroom?.agentConfigs ?? []).find((a) => a.role === 'teacher');
    const speed = engineRef.current?.getSpeed() ?? 1;
    // Open whiteboard and clear any previous content for the worked solution
    setWbState((prev) => applyWBAction(prev, { name: 'wb_open', params: {} }));
    await new Promise<void>((r) => setTimeout(r, 300));
    setWbState((prev) => applyWBAction(prev, { name: 'wb_clear', params: {} }));
    for (const step of result.steps) {
      // Render this step's draw commands onto the whiteboard
      setWbState((prev) => {
        let next = prev;
        for (const act of step.wbActions) next = applyWBAction(next, act as WBAction);
        return next;
      });
      // Speak the teacher's explanation for this step
      if (step.speech) {
        const hint = resolveVoiceHint(teacherAgent?.role, {
          ...teacherAgent?.voiceHint,
          rate: (teacherAgent?.voiceHint?.rate ?? 1) * speed,
        });
        await speakText(step.speech, hint);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroom?.agentConfigs]);

  // ── Scene-complete handler — auto-next + proactive agent engagement ──────
  useEffect(() => {
    if (!pbState || pbState.playbackState !== 'scene-complete') return;
    // Don't fire if we're already handling a Q&A or proactive session.
    // Include isQaLoading in deps so we still fire after Q&A finishes.
    if (isQaLoading) return;
    handleProactiveEngagement(pbState.currentSceneIndex);
  }, [pbState?.playbackState, pbState?.currentSceneIndex, isQaLoading, handleProactiveEngagement]);

  // Derive agent map for SpeechBubble (must stay above all early returns)
  const agentMap = useMemo(() => {
    const map = new Map<string, AgentConfig>();
    (classroom?.agentConfigs ?? []).forEach((a) => map.set(a.id, a));
    return map;
  }, [classroom?.agentConfigs]);

  const currentAgent = pbState?.currentSpeakingAgentId
    ? agentMap.get(pbState.currentSpeakingAgentId)
    : undefined;

  // ==================== Render States ====================

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Loading classroom...</p>
        </div>
      </div>
    );
  }

  if (error || !classroom) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
          <p className="text-destructive text-sm">{error || 'Classroom not found'}</p>
          <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // Generating state — also shown while waiting for the agent reveal modal to close
  if (classroom.status === 'generating' || revealPending) {
    return (
      <>
        <GenerationProgressScreen
          title={classroom.title}
          progress={revealPending ? 100 : (classroom.generation?.progress ?? 0)}
          message={revealPending ? 'Your classroom is ready!' : (classroom.generation?.message ?? 'Preparing your classroom...')}
          scenesCompleted={revealPending ? (classroom.generation?.totalScenes ?? 0) : (classroom.generation?.scenesCompleted ?? 0)}
          totalScenes={classroom.generation?.totalScenes ?? 0}
          agentConfigs={classroom.agentConfigs ?? []}
          hasPdf={!classroom.isCustom}
        />
        {revealPending && (
          <AgentRevealModal
            agents={classroom.agentConfigs ?? []}
            open={showRevealModal}
            onClose={() => {
              setShowRevealModal(false);
              setRevealPending(false);
            }}
          />
        )}
      </>
    );
  }

  // Error state
  if (classroom.status === 'error') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
          <h2 className="text-lg font-semibold text-foreground">Generation Failed</h2>
          <p className="text-muted-foreground text-sm">
            {classroom.errorMessage || 'Something went wrong while generating your classroom.'}
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Dashboard
            </Button>
            <Button size="sm" onClick={() => window.location.reload()}>
              <RefreshCcw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== Ready — Main Classroom View ====================

  const scenes = classroom.scenes;
  const currentScene = pbState ? scenes[pbState.currentSceneIndex] : scenes[0];
  if (!currentScene) return null;

  const completedSceneIds = classroom.progress?.completedScenes || [];
  const quizResult = classroom.progress?.quizResults?.find((r) => r.sceneId === currentScene.id);

  // Collect agent configs for the discussion overlay
  const agentConfigs = classroom.agentConfigs ?? [];

  // True while background scene generation is still running
  const backgroundGen =
    (classroom.generation?.scenesCompleted ?? 0) < (classroom.generation?.totalScenes ?? 0) &&
    (classroom.generation?.totalScenes ?? 0) > 0;

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Header */}
      <header
        className="h-14 border-b border-border/40 flex items-center pl-3 pr-4 gap-3 flex-shrink-0 z-50 bg-background/90 backdrop-blur-xl"
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:bg-muted"
          onClick={() => navigate('/dashboard')}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>

        {/* Vertical divider */}
        <div className="w-px h-5 bg-border/30" />

        <div className="flex-1 min-w-0">
          <h1 className="text-[13px] font-semibold text-foreground/90 truncate leading-tight">{classroom.title}</h1>
          <p className="text-[10px] text-muted-foreground/50 truncate">{currentScene.title}</p>
        </div>

        {/* Agent avatar strip */}
        {agentConfigs.length > 0 && (
          <div className="flex items-center gap-2 mr-2">
            <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/30 font-bold hidden sm:block">
              Agents
            </span>
            <div className="flex -space-x-1.5">
              {agentConfigs.slice(0, 4).map((agent) => (
                <div
                  key={agent.id}
                  className="w-7 h-7 rounded-full border-[1.5px] border-background overflow-hidden flex items-center justify-center text-[11px] font-bold"
                  style={{
                    backgroundColor: (agent.color ?? '#6366f1') + '33',
                    boxShadow: activeDiscussAgent?.id === agent.id
                      ? `0 0 0 2px ${agent.color ?? '#6366f1'}`
                      : undefined,
                  }}
                  title={agent.name}
                >
                  {agent.avatar?.startsWith('/') || agent.avatar?.startsWith('http') ? (
                    <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
                  ) : (
                    <span style={{ color: agent.color ?? '#6366f1' }}>{agent.name[0]}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Export to PPTX */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground/50 hover:text-foreground hover:bg-white/8"
          title="Export as PowerPoint"
          onClick={() => exportClassroomToPptx(classroom)}
        >
          <Download className="w-4 h-4" />
        </Button>
      </header>

      {/* Background generation banner — visible while remaining scenes are still being produced */}
      {backgroundGen && (
        <div className="flex items-center gap-2 px-4 py-1 text-[11px] text-primary/70 bg-primary/6 border-b border-primary/10 flex-shrink-0">
          <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
          <span>
            Generating scenes… (
            {classroom.generation?.scenesCompleted ?? 0} of 
            {classroom.generation?.totalScenes ?? 0} ready)
          </span>
        </div>
      )}

      {/* Post-scene Q&A banner — shown while user is in free-ask mode */}
      {postSceneQaMode && !showPostScenePrompt && (
        <div className="flex items-center gap-3 px-4 py-2 text-[12px] bg-primary/10 border-b border-primary/15 flex-shrink-0">
          <MessageCircle className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span className="text-primary/80 flex-1">Ask your questions in the chat panel. Take your time!</span>
          <Button size="sm" className="h-7 text-[11px] px-3" onClick={handlePostSceneContinue}>
            Continue <ArrowRight className="w-3 h-3 ml-1.5" />
          </Button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Side nav */}
        <SceneNav
          scenes={scenes}
          currentSceneIndex={pbState?.currentSceneIndex ?? 0}
          completedSceneIds={completedSceneIds}
          onSceneClick={(i) => engineRef.current?.goToScene(i)}
        />

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden relative">

          {/* ── Lesson — 16:9 slide canvas ── */}
          {!wbState.isOpen && currentScene.type === 'lesson' && (
            <div className="flex-1 flex items-center justify-center overflow-hidden"
              style={{ padding: '12px 16px 160px' }}
            >
              {/* Slide card — 16:9, fills available space, content scrolls inside */}
              <div
                className="relative w-full overflow-hidden rounded-2xl"
                style={{
                  aspectRatio: '16 / 9',
                  maxHeight: '100%',
                  maxWidth: 'min(100%, calc((100dvh - 220px) * 16 / 9))',
                  background: 'var(--slide-card-bg)',
                  boxShadow: [
                    '0 0 0 1px hsl(245 78% 60% / 0.10)',
                    '0 16px 60px hsl(220 50% 2% / 0.35)',
                    'inset 0 1px 0 hsl(245 78% 90% / 0.05)',
                  ].join(', '),
                }}
              >
                {/* Subtle top-edge glow line */}
                <div
                  className="absolute top-0 left-1/4 right-1/4 h-px rounded-full pointer-events-none"
                  style={{ background: 'linear-gradient(90deg, transparent, hsl(245 78% 70% / 0.35), transparent)' }}
                />

                {/* Corner accent marks (like a slide frame) */}
                {[
                  'top-2 left-2 border-t border-l',
                  'top-2 right-2 border-t border-r',
                  'bottom-2 left-2 border-b border-l',
                  'bottom-2 right-2 border-b border-r',
                ].map((pos) => (
                  <div
                    key={pos}
                    className={`absolute w-3 h-3 pointer-events-none ${pos}`}
                    style={{ borderColor: 'hsl(245 78% 70% / 0.18)', borderWidth: 1 }}
                  />
                ))}

                {/* Scrollable content area */}
                <div
                  className="absolute inset-0 overflow-y-auto px-10 py-8"
                  style={{ scrollbarWidth: 'thin' }}
                >
                  <LessonRenderer
                    sections={(currentScene.content as LessonContent).sections}
                    classroomId={id}
                    sceneId={currentScene.id}
                    sceneTitle={currentScene.title}
                    mediaTasks={classroom?.mediaTasks}
                    highlightedSectionId={pbState?.highlightedSectionId ?? null}
                    revealedSectionIds={pbState?.revealedSectionIds ?? new Set<string>()}
                    showAll={!pbState || pbState.playbackState === 'idle'}
                    slideMode
                    onMathPracticeResult={handleMathPracticeResult}
                    subjectId={classroom?.subjectId}
                    strandName={currentScene.title}
                    spotlightState={pbState?.spotlightState ?? null}
                    laserState={pbState?.laserState ?? null}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Quiz — centred scrollable area ── */}
          {!wbState.isOpen && currentScene.type === 'quiz' && (
            <div className="flex-1 overflow-y-auto pb-52 pt-6 px-4 md:px-8">
              <QuizRenderer
                questions={(currentScene.content as QuizContent).questions}
                sceneId={currentScene.id}
                onSubmit={handleQuizSubmit}
                existingResult={quizResult ? { answers: quizResult.answers, score: quizResult.score } : null}
                subjectId={classroom?.subjectId}
                strandName={currentScene.title}
              />
            </div>
          )}

          {/* Whiteboard — visible when open and there are elements (or agent just opened it) */}
          {wbState.isOpen && (
            <div
              className="absolute inset-4 z-20"
              style={{
                bottom: 172,
              }}
            >
              <Whiteboard
                state={wbState}
                agentLabel={activeDiscussAgent?.name}
                onClose={() => setWbState((prev) => ({ ...prev, isOpen: false }))}
                onStateChange={setWbState}
                historyScopeKey={currentScene.id}
              />
            </div>
          )}

          {/* ── Participant bar — docked to the stage area ── */}
          <ParticipantBar
            text={activeDiscussAgent ? (discussResponses[discussResponses.length - 1]?.speech ?? null) : (pbState?.currentSpeech ?? null)}
            isPlaying={activeDiscussAgent ? true : pbState?.playbackState === 'playing'}
            onSkip={() => engineRef.current?.skipSpeech()}
            agent={activeDiscussAgent ?? currentAgent}
            allAgents={agentConfigs}
            activeAgentId={pbState?.currentSpeakingAgentId ?? activeDiscussAgent?.id ?? null}
            playbackSpeed={pbState?.playbackSpeed ?? 1}
            userAvatar={profileAvatar}
            userName={authUser?.preferredName || profileNickname || 'You'}
            awaitingCue={awaitingStudentCue}
          />
        </main>

        {/* ── Right: Notes + Chat panel ── */}
        <ClassChatPanel
          scenes={scenes}
          currentSceneIndex={pbState?.currentSceneIndex ?? 0}
          messages={chatMessages}
          isQaLoading={isQaLoading}
          micActive={audioRecorder.isRecording || isListening || audioRecorder.isProcessing}
          agentConfigs={agentConfigs}
          onAskQuestion={handleAskQuestion}
          onMicToggle={handleMicToggle}
          interimTranscript={interimTranscript}
          chatTabTrigger={chatTabTrigger}
          isOpen={notesOpen}
          onClose={() => setNotesOpen(false)}
        />

        {/* Panel re-open button — only when panel is closed */}
        {!notesOpen && (
          <button
            onClick={() => setNotesOpen(true)}
            className="flex-shrink-0 w-8 flex flex-col items-center justify-center gap-1 border-l border-border/20 text-muted-foreground/30 hover:text-primary hover:bg-primary/5 transition-colors"
            title="Open classroom panel"
          >
            <BookOpen className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────────────
           Discussion Room — full-screen multi-turn discussion
      ──────────────────────────────────────────────────────────────── */}
      {discussionRoom && id && (
        <DiscussionRoomOverlay
          topic={discussionRoom.topic}
          prompt={discussionRoom.prompt}
          classroomId={id}
          agentConfigs={agentConfigs}
          onClose={handleDiscussionRoomClose}
        />
      )}

      {/* Playback controls */}
      {pbState && (
        <PlaybackControls
          playbackState={pbState.playbackState}
          currentSceneIndex={pbState.currentSceneIndex}
          totalScenes={scenes.length}
          playbackSpeed={pbState.playbackSpeed ?? 1}
          discussionActive={pbState.discussionActive}
          micActive={audioRecorder.isRecording || isListening || audioRecorder.isProcessing}
          onPlay={() => engineRef.current?.play()}
          onPause={() => engineRef.current?.pause()}
          onResume={() => engineRef.current?.resume()}
          onNextScene={handleNextScene}
          onPrevScene={() => engineRef.current?.prevScene()}
          onRestart={() => {
            engineRef.current?.stop();
            engineRef.current?.play();
          }}
          onSpeedChange={(s) => engineRef.current?.setSpeed(s)}
          onMicToggle={handleMicToggle}
        />
      )}

      {/* ── Agent Reveal Modal ── shown once on first classroom load ── */}
      {/* (Also rendered in the generating/revealPending block above; this is a no-op fallback) */}
      <AgentRevealModal
        agents={classroom.agentConfigs ?? []}
        open={showRevealModal && !revealPending}
        onClose={() => setShowRevealModal(false)}
      />

      {/* ────────────────────────────────────────────────────────────────
           Post-scene "Any questions?" prompt
      ──────────────────────────────────────────────────────────────── */}
      {showPostScenePrompt && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 backdrop-blur-md"
        >
          <div
            className="relative w-full max-w-sm mx-4 rounded-2xl p-8 text-center bg-card border border-border"
            style={{ boxShadow: '0 0 0 1px hsl(245 78% 60% / 0.10), 0 24px 60px hsl(220 50% 2% / 0.3)' }}
          >
            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 bg-primary/10 ring-1 ring-primary/20">
              <HelpCircle className="w-7 h-7 text-primary" />
            </div>

            <h3 className="text-base font-bold text-foreground mb-1.5">Slide complete!</h3>
            <p className="text-[13px] text-muted-foreground/70 leading-relaxed mb-7">
              Any questions about what was just covered before we move on?
            </p>

            <div className="flex flex-col gap-3">
              {/* Yes — open Q&A mode in the chat panel */}
              <Button className="w-full gap-2" onClick={handlePostSceneYes}>
                <MessageCircle className="w-4 h-4" />
                Yes, I have a question
              </Button>

              {/* No — advance immediately */}
              <Button
                variant="outline"
                className="w-full gap-2 border-border/30 hover:border-primary/40"
                onClick={handlePostSceneNo}
              >
                Continue to next slide
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
