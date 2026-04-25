import type { DiscussionAgentResponse } from '@/lib/types/chat';
import type { MediaTask, Scene } from '@/lib/playback/types';

export type { DiscussionAgentResponse };

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    return localStorage.getItem('neurospace_token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(data.error || 'Request failed', response.status, data);
    }

    return data as T;
  }

  // ---------- Auth ----------

  async register(email: string, password: string, accountType: 'parent' | 'student') {
    return this.request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, accountType }),
    });
  }

  async login(email: string, password: string) {
    return this.request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async getMe() {
    return this.request<{ user: User }>('/auth/me');
  }

  async completeOnboarding(data: OnboardingData) {
    return this.request<{ user: User }>('/auth/onboarding', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // ---------- Children (Parent) ----------

  async addChild(data: { email: string; password: string; preferredName: string }) {
    return this.request<{ child: User }>('/auth/children', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getChildren() {
    return this.request<{ children: User[] }>('/auth/children');
  }

  async getChildProfile(childId: string) {
    return this.request<{ child: User; profile: LearnerProfile }>(
      `/users/child/${childId}/profile`,
    );
  }

  // ---------- User Profile ----------

  async getLearnerProfile() {
    return this.request<{ profile: LearnerProfile }>('/users/profile');
  }

  async updateProfile(data: Partial<User>) {
    return this.request<{ user: User }>('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // ---------- Curriculum ----------

  async getCourses(grade?: string) {
    const query = grade ? `?grade=${encodeURIComponent(grade)}` : '';
    return this.request<{ courses: Course[] }>(`/curriculum${query}`);
  }

  async getCourse(subjectId: string) {
    return this.request<{ course: Course }>(`/curriculum/${subjectId}`);
  }

  async getGrades() {
    return this.request<{ grades: GradeInfo[] }>('/curriculum/grades/list');
  }

  // ---------- Health ----------

  async health() {
    return this.request<{ status: string }>('/health');
  }

  // ---------- Classroom ----------

  async generateClassroom(subjectId: string) {
    return this.request<{ classroomId: string; status: string; message: string }>(
      '/classroom/generate',
      { method: 'POST', body: JSON.stringify({ subjectId }) },
    );
  }

  async createCustomClassroom(topic: string, grade?: string) {
    return this.request<{ classroomId: string; status: string; message: string }>(
      '/classroom/custom',
      { method: 'POST', body: JSON.stringify({ topic, grade }) },
    );
  }

  async getClassroom(id: string) {
    return this.request<ClassroomDetail>(`/classroom/${id}`);
  }

  async listClassrooms() {
    return this.request<ClassroomSummary[]>('/classroom');
  }

  async updateClassroomProgress(
    id: string,
    data: {
      currentSceneIndex?: number;
      currentActionIndex?: number;
      completedSceneId?: string;
      timeSpentMs?: number;
    },
  ) {
    return this.request<{ progress: unknown }>(`/classroom/${id}/progress`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async submitQuiz(classroomId: string, data: { sceneId: string; answers: Record<string, string[]> }) {
    return this.request<{ score: number; earnedPoints: number; totalPoints: number }>(
      `/classroom/${classroomId}/quiz`,
      { method: 'POST', body: JSON.stringify(data) },
    );
  }

  async gradeShortAnswer(data: {
    question: string;
    userAnswer: string;
    points: number;
    commentPrompt?: string;
  }) {
    return this.request<{ score: number; comment: string }>(
      '/quiz-grade',
      { method: 'POST', body: JSON.stringify(data) },
    );
  }

  /**
   * Grade a student's answer to a math practice problem.
   * When incorrect the server returns step-by-step WB draw actions + speech
   * so the teacher can animate the solution on the whiteboard.
   */
  async mathCheck(data: { problem: string; answer: string; sceneTitle?: string }) {
    return this.request<{
      correct: boolean;
      feedback: string;
      steps?: Array<{
        speech: string;
        wbActions: Array<{ name: string; params: Record<string, unknown> }>;
      }>;
    }>('/math-check', { method: 'POST', body: JSON.stringify(data) });
  }

  // ---------- Question Solver ----------

  /**
   * Solve any homework question — text or image (base64).
   * For math subjects the response includes whiteboard step animations + speech.
   */
  async solveQuestion(data: {
    question?: string;
    imageBase64?: string;
    mimeType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  }) {
    return this.request<{
      subject: string;
      isMath: boolean;
      answer: string;
      explanation: string;
      sections?: Array<{ title: string; content: string }> | null;
      steps?: Array<{
        speech: string;
        wbActions: Array<{ name: string; params: Record<string, unknown> }>;
      }> | null;
      copyText: string;
    }>('/solver', { method: 'POST', body: JSON.stringify(data) });
  }

  /** Generate a similar practice question at a given difficulty. */
  async generatePractice(data: {
    originalQuestion: string;
    subject: string;
    isMath: boolean;
    difficulty?: 'easier' | 'similar' | 'harder';
    originalAnswer?: string;
  }) {
    return this.request<{
      question: string;
      hint: string;
      answer: string;
      explanation: string;
      difficulty: string;
      isMath: boolean;
    }>('/solver/practice', { method: 'POST', body: JSON.stringify(data) });
  }

  /** Check a student's answer to a practice question. */
  async checkPracticeAnswer(data: {
    question: string;
    correctAnswer: string;
    studentAnswer: string;
    subject: string;
    isMath: boolean;
  }) {
    return this.request<{
      correct: boolean;
      feedback: string;
      hint?: string;
    }>('/solver/check-practice', { method: 'POST', body: JSON.stringify(data) });
  }

  /** Ask a one-shot contextual follow-up question about a solved problem. */
  async solverFollowup(data: {
    followupQuestion: string;
    context: { question: string; answer: string; explanation: string; subject: string };
    history?: Array<{ role: 'student' | 'tutor'; content: string }>;
  }) {
    return this.request<{ answer: string }>(
      '/solver/followup',
      { method: 'POST', body: JSON.stringify(data) },
    );
  }

  // ---------- Notebook (Personal Revision Bank) ----------

  /** List all saved notebook entries, optionally filtered. */
  async listNotebook(filters?: { subject?: string; status?: string; q?: string }) {
    const params = new URLSearchParams();
    if (filters?.subject) params.set('subject', filters.subject);
    if (filters?.status)  params.set('status',  filters.status);
    if (filters?.q)       params.set('q',        filters.q);
    const qs = params.toString();
    return this.request<{ entries: NotebookEntry[] }>(`/notebook${qs ? `?${qs}` : ''}`);
  }

  /** Save a solved question to the notebook. */
  async saveToNotebook(data: {
    question: string;
    imageThumbnail?: string;
    subject: string;
    strand?: string;
    answer: string;
    explanation?: string;
    isMath?: boolean;
    copyText?: string;
  }) {
    return this.request<{ entry: NotebookEntry }>(
      '/notebook',
      { method: 'POST', body: JSON.stringify(data) },
    );
  }

  /** Update a notebook entry's status. */
  async updateNotebookStatus(id: string, status: 'solved' | 'needs_practice' | 'mastered') {
    return this.request<{ entry: NotebookEntry }>(
      `/notebook/${id}/status`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
    );
  }

  /** Record a practice run against a notebook entry. */
  async recordNotebookPractice(id: string) {
    return this.request<{ entry: NotebookEntry }>(
      `/notebook/${id}/practiced`,
      { method: 'PATCH', body: JSON.stringify({}) },
    );
  }

  /** Delete a notebook entry. */
  async deleteNotebookEntry(id: string) {
    return this.request<{ ok: boolean }>(`/notebook/${id}`, { method: 'DELETE' });
  }

  // ---------- Diagnostic / Gap Map ----------

  /** Check if the student has already completed the Tier 1 diagnostic for a subject. */
  async getDiagnosticStatus(subjectId: string) {
    return this.request<DiagnosticStatusResponse>(`/diagnostic/status/${subjectId}`);
  }

  /** Generate a Tier 1 full subject diagnostic (10-12 MCQs). */
  async generateDiagnostic(subjectId: string) {
    return this.request<DiagnosticGenerateResponse>('/diagnostic/generate', {
      method: 'POST',
      body: JSON.stringify({ subjectId }),
    });
  }

  /** Submit all answers for a diagnostic session; get graded results + strandScores. */
  async submitDiagnostic(
    sessionId: string,
    answers: Array<{ questionId: string; selectedAnswer: string; timeSpentSeconds?: number }>,
  ) {
    return this.request<DiagnosticSubmitResponse>(`/diagnostic/${sessionId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    });
  }

  /** Generate a Tier 2 pre-classroom topic check (3-5 MCQs). */
  async generatePrecheck(subjectId: string, topic: string, questionCount?: number) {
    return this.request<PrecheckGenerateResponse>('/diagnostic/precheck', {
      method: 'POST',
      body: JSON.stringify({ subjectId, topic, questionCount }),
    });
  }

  /**
   * Tier 3 — push a quiz/flashcard/math result to update the Gap Map.
   * @param scorePercent  0-100 score from the activity
   */
  async pushDiagnosticFeedback(
    subjectId: string,
    strand: string,
    scorePercent: number,
    activityType?: 'quiz' | 'flashcard' | 'math_practice' | 'short_answer',
  ) {
    return this.request<{ strand: string; newStrandScore: number; strandScores: Record<string, number> }>(
      '/diagnostic/feedback',
      {
        method: 'POST',
        body: JSON.stringify({ subjectId, strand, scorePercent, activityType }),
      },
    );
  }

  async deleteClassroom(id: string) {
    return this.request<{ message: string }>(`/classroom/${id}`, {
      method: 'DELETE',
    });
  }

  // ---------- AI Model Settings (premium) ----------

  /** Get available models for the current user tier + current preference */
  async getAvailableModels() {
    return this.request<{
      models: Array<{ id: string; label: string; provider: string; tier: string }>;
      currentModel: string;
      tier: string;
    }>('/users/models');
  }

  /** Get all provider catalogues (LLM, image, video, TTS, ASR) with availability */
  async getSettingsCatalogues() {
    return this.request<{
      llm: Array<CatalogueEntry & { tier: string; requiresPremium: boolean }>;
      image: CatalogueEntry[];
      video: CatalogueEntry[];
      tts: CatalogueEntry[];
      asr: CatalogueEntry[];
    }>('/users/settings-catalogues');
  }

  /** Update preferred AI model (premium only) */
  async updateSettings(data: { preferredModel?: string }) {
    return this.request<{ user: User }>('/users/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // ---------- Phase 3: Enter Classroom (PDF curriculum pipeline) ----------

  /**
   * Enter a curriculum-based classroom.
   * Returns either:
   *   - { resume: { classroomId, sceneIndex, progressMs } } — existing session found
   *   - { classroomId, status, pollUrl, pollIntervalMs }    — new generation started (202)
   */
  async enterClassroom(grade: string, courseId: string) {
    return this.request<EnterClassroomResponse>('/classroom/enter', {
      method: 'POST',
      body: JSON.stringify({ grade, courseId }),
    });
  }

  // ---------- Phase 3: Session ----------

  async getSession(courseId: string) {
    return this.request<{ session: SessionProgress | null }>(`/session/${courseId}`);
  }

  async saveSession(courseId: string, data: SaveSessionInput) {
    return this.request<{ ok: boolean }>(`/session/${courseId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteSession(courseId: string) {
    return this.request<{ ok: boolean }>(`/session/${courseId}`, {
      method: 'DELETE',
    });
  }

  // ---------- Live Discussion ----------

  async transcribeAudio(audioBlob: Blob): Promise<{ text: string }> {
    const token = this.getToken();
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${this.baseUrl}/transcription`, {
      method: 'POST',
      headers,
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) throw new ApiError(data.error || 'Transcription failed', response.status, data);
    return data as { text: string };
  }

  /**
   * Trigger a live discussion round.
   *
   * Streams agent responses via SSE so the UI can render and speak each
   * agent the moment it finishes, without waiting for the full batch.
   *
   * @param onAgentStart    — called when an agent begins generating (show thinking spinner)
   * @param onAgentResponse — called when an agent's full response is ready (apply WB + start TTS)
   * @returns               — full collected responses array after the stream ends
   */
  async discuss(params: {
    classroomId: string;
    discussionTopic: string;
    discussionPrompt?: string;
    sceneTitle?: string;
    sceneType?: 'lesson' | 'quiz';
    sceneSectionIds?: string[];
    studentMessage?: string;
    /** Pre-existing whiteboard elements serialised as ledger records. */
    initialWbLedger?: Array<{ agentName: string; actionName: string; params: Record<string, unknown> }>;
    userProfile?: { nickname?: string; bio?: string };
    /** When set, only agents whose role is in this array will participate. */
    targetRoles?: string[];
    onAgentStart?: (agentId: string, agentName: string, agentRole: string) => void;
    onAgentResponse?: (resp: DiscussionAgentResponse) => void;
    /** Called when the server signals it is the student's turn to respond. */
    onCueUser?: (fromAgentId: string | null) => void;
  }): Promise<{ responses: DiscussionAgentResponse[] }> {
    const { onAgentStart, onAgentResponse, onCueUser, ...body } = params;
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${this.baseUrl}/discuss`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError((data as { error?: string }).error || 'Discussion failed', response.status, data);
    }

    const responses: DiscussionAgentResponse[] = [];
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // SSE: events separated by blank lines; data lines start with "data: "
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';

        for (const block of parts) {
          for (const line of block.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6)) as {
                type: string;
                agentId?: string;
                agentName?: string;
                agentRole?: string;
                speech?: string;
                whiteboardActions?: DiscussionAgentResponse['whiteboardActions'];
                message?: string;
                fromAgentId?: string | null;
              };
              if (event.type === 'agent_start' && event.agentId) {
                onAgentStart?.(event.agentId, event.agentName ?? '', event.agentRole ?? '');
              } else if (event.type === 'agent_response' && event.agentId) {
                const resp: DiscussionAgentResponse = {
                  agentId:          event.agentId,
                  agentName:        event.agentName ?? '',
                  agentRole:        event.agentRole ?? '',
                  speech:           event.speech ?? '',
                  whiteboardActions: event.whiteboardActions ?? [],
                };
                responses.push(resp);
                onAgentResponse?.(resp);
              } else if (event.type === 'cue_user') {
                onCueUser?.(event.fromAgentId ?? null);
              } else if (event.type === 'error') {
                throw new ApiError(event.message ?? 'Discussion error', 500);
              }
            } catch (parseErr) {
              if (parseErr instanceof ApiError) throw parseErr;
              // Malformed JSON line — skip
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { responses };
  }

  /**
   * Live agent interrupt — fires after each teacher speech block.
   *
   * Non-teacher agents (assistant, student) independently decide whether
   * to react in character. Agents may stay silent (return nothing).
   * Streams the same SSE format as discuss().
   */
  async interrupt(params: {
    classroomId: string;
    teacherSpeech: string;
    sceneTitle?: string;
    sceneDescription?: string;
    userProfile?: { nickname?: string; bio?: string };
    onAgentStart?: (agentId: string, agentName: string, agentRole: string) => void;
    onAgentResponse?: (resp: DiscussionAgentResponse) => void;
  }): Promise<void> {
    const { onAgentStart, onAgentResponse, ...body } = params;
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${this.baseUrl}/interrupt`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError((data as { error?: string }).error || 'Interrupt failed', response.status, data);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';

        for (const block of parts) {
          for (const line of block.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6)) as {
                type: string;
                agentId?: string;
                agentName?: string;
                agentRole?: string;
                speech?: string;
                whiteboardActions?: DiscussionAgentResponse['whiteboardActions'];
              };
              if (event.type === 'agent_start' && event.agentId) {
                onAgentStart?.(event.agentId, event.agentName ?? '', event.agentRole ?? '');
              } else if (event.type === 'agent_response' && event.agentId) {
                onAgentResponse?.({
                  agentId:          event.agentId,
                  agentName:        event.agentName ?? '',
                  agentRole:        event.agentRole ?? '',
                  speech:           event.speech ?? '',
                  whiteboardActions: event.whiteboardActions ?? [],
                });
              }
            } catch {
              // Malformed line — skip
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Ask a question mid-lecture.
   *
   * Streams the same SSE format as `discuss()` but uses role-calibrated
   * Q&A prompts: teacher answers directly, assistant supplements, student reacts.
   */
  async askQuestion(params: {
    classroomId: string;
    question: string;
    sceneTitle?: string;
    sceneType?: 'lesson' | 'quiz';
    sceneSectionIds?: string[];
    initialWbLedger?: Array<{ agentName: string; actionName: string; params: Record<string, unknown> }>;
    userProfile?: { nickname?: string; bio?: string };
    onAgentStart?: (agentId: string, agentName: string, agentRole: string) => void;
    onAgentResponse?: (resp: DiscussionAgentResponse) => void;
  }): Promise<{ responses: DiscussionAgentResponse[] }> {
    const { onAgentStart, onAgentResponse, ...body } = params;
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${this.baseUrl}/ask`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError((data as { error?: string }).error || 'Q&A failed', response.status, data);
    }

    const responses: DiscussionAgentResponse[] = [];
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const block of parts) {
          for (const line of block.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6)) as {
                type: string;
                agentId?: string;
                agentName?: string;
                agentRole?: string;
                speech?: string;
                whiteboardActions?: DiscussionAgentResponse['whiteboardActions'];
                message?: string;
              };
              if (event.type === 'agent_start' && event.agentId) {
                onAgentStart?.(event.agentId, event.agentName ?? '', event.agentRole ?? '');
              } else if (event.type === 'agent_response' && event.agentId) {
                const resp: DiscussionAgentResponse = {
                  agentId:          event.agentId,
                  agentName:        event.agentName ?? '',
                  agentRole:        event.agentRole ?? '',
                  speech:           event.speech ?? '',
                  whiteboardActions: event.whiteboardActions ?? [],
                };
                responses.push(resp);
                onAgentResponse?.(resp);
              } else if (event.type === 'error') {
                throw new ApiError(event.message ?? 'Q&A error', 500);
              }
            } catch (parseErr) {
              if (parseErr instanceof ApiError) throw parseErr;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { responses };
  }

  /**
   * Discussion Room — multi-turn free discussion between the student and peers.
   *
   * mode:'intro'  — teacher gives opening intro speech and steps back.
   * mode:'turn'   — assistant + student-agent respond to the student's message.
   */
  async discussionRoom(params: {
    classroomId: string;
    topic: string;
    prompt?: string;
    mode: 'intro' | 'turn';
    history?: { role: 'user' | 'agent'; agentName?: string; content: string }[];
    userMessage?: string;
    userProfile?: { nickname?: string; bio?: string };
    onAgentStart?: (agentId: string, agentName: string, agentRole: string) => void;
    onAgentResponse?: (resp: DiscussionAgentResponse) => void;
  }): Promise<{ responses: DiscussionAgentResponse[] }> {
    const { onAgentStart, onAgentResponse, ...body } = params;
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${this.baseUrl}/discussion-room`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError((data as { error?: string }).error || 'Discussion room failed', response.status, data);
    }

    const responses: DiscussionAgentResponse[] = [];
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const block of parts) {
          for (const line of block.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6)) as {
                type: string;
                agentId?: string;
                agentName?: string;
                agentRole?: string;
                speech?: string;
                whiteboardActions?: DiscussionAgentResponse['whiteboardActions'];
                message?: string;
              };
              if (event.type === 'agent_start' && event.agentId) {
                onAgentStart?.(event.agentId, event.agentName ?? '', event.agentRole ?? '');
              } else if (event.type === 'agent_response' && event.agentId) {
                const resp: DiscussionAgentResponse = {
                  agentId:           event.agentId,
                  agentName:         event.agentName ?? '',
                  agentRole:         event.agentRole ?? '',
                  speech:            event.speech ?? '',
                  whiteboardActions: event.whiteboardActions ?? [],
                };
                responses.push(resp);
                onAgentResponse?.(resp);
              } else if (event.type === 'error') {
                throw new ApiError(event.message ?? 'Discussion room error', 500);
              }
            } catch (parseErr) {
              if (parseErr instanceof ApiError) throw parseErr;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { responses };
  }

  // ---------- Tutor Sessions ----------

  async listTutorSessions() {
    return this.request<{ sessions: TutorSessionSummary[] }>('/tutor/sessions');
  }

  async getTutorSession(sessionId: string) {
    return this.request<{ session: TutorSessionDetail }>(`/tutor/sessions/${sessionId}`);
  }

  async deleteTutorSession(sessionId: string) {
    return this.request<{ ok: boolean }>(`/tutor/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  }
}

// ---------- Error Class ----------

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// ---------- Types ----------

export interface User {
  id: string;
  email: string;
  accountType: 'parent' | 'student';
  subscription: 'free' | 'premium';
  onboardingCompleted: boolean;
  freeClassroomsUsed: number;
  preferredName?: string;
  age?: number;
  grade?: string;
  programOfStudy?: string;
  school?: string;
  avatarUrl?: string;
  /** Premium users only — selected AI model ID */
  preferredModel?: string;
  children: User[];
  parentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingData {
  preferredName: string;
  age: number;
  grade: string;
  programOfStudy?: string;
  school?: string;
}

export interface LearnerProfile {
  id: string;
  userId: string;
  diagnosticCompleted: boolean;
  overallLevel: 'beginner' | 'intermediate' | 'advanced';
  subjects: SubjectProgress[];
  totalXP: number;
  level: number;
  streak: number;
  longestStreak: number;
  lastActiveDate?: string;
  /** Sorted array of YYYY-MM-DD strings for the last 365 study days */
  studyDays: string[];
}

export interface SubjectProgress {
  subjectId: string;
  subjectName: string;
  lessonsCompleted: number;
  totalLessons: number;
  currentLessonId?: string;
  strengthScore: number;
  weakTopics: string[];
  strongTopics: string[];
  lastAccessedAt?: string;
  timeSpentMinutes: number;
  /** Per-strand mastery scores from Tier 1 diagnostic (strand → 0-100). */
  strandScores?: Record<string, number>;
  /** ISO timestamp when the Tier 1 subject diagnostic was completed. */
  diagnosticCompletedAt?: string;
}

export interface Course {
  id: string;
  grade: string;
  subjectName: string;
  subjectId: string;
  description: string;
  pdfUrl: string;
  totalLessons: number;
  topics: string[];
  examType?: string;
  isActive: boolean;
}

export interface GradeInfo {
  grade: string;
  courseCount: number;
  subjects: string[];
}

export interface ClassroomSummary {
  id: string;
  userId: string;
  title: string;
  description: string;
  subjectId?: string;
  grade?: string;
  status: 'generating' | 'ready' | 'error';
  isCustom: boolean;
  customTopic?: string;
  progress: {
    currentSceneIndex: number;
    currentActionIndex: number;
    completedScenes: string[];
    quizResults: Array<{
      sceneId: string;
      answers: Record<string, string[]>;
      score: number;
      completedAt: string;
    }>;
    totalTimeSpentMs: number;
    startedAt: string;
    lastAccessedAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ClassroomDetail extends ClassroomSummary {
  scenes: Scene[];
  mediaTasks?: MediaTask[];
  errorMessage?: string;
}

// ---------- Phase 3 Types ----------

export interface ResumePayload {
  classroomId: string;
  sceneIndex: number;
  progressMs: number;
}

export type EnterClassroomResponse =
  | { resume: ResumePayload; message: string }
  | {
      classroomId: string;
      status: string;
      message: string;
      pollUrl: string;
      pollIntervalMs: number;
    };

export interface SessionProgress {
  userId: string;
  courseId: string;
  classroomId: string;
  sceneIndex: number;
  progressMs: number;
  completedScenes: number[];
  startedAt: string;
  lastSeenAt: string;
}

export interface SaveSessionInput {
  classroomId: string;
  sceneIndex: number;
  progressMs: number;
  completedScenes: number[];
}

// ---------- Tutor Session Types ----------

export interface TutorSessionSummary {
  _id: string;
  title: string;
  topic: string;
  phase: string;
  assessedLevel?: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TutorSessionDetail {
  _id: string;
  title: string;
  topic: string;
  phase: string;
  assessedLevel?: string;
  assessmentEvidence?: string;
  entryPoint?: string;
  pdfContext?: string;
  probeCount: number;
  teachCycleCount: number;
  messages: Array<{
    role: 'user' | 'tutor';
    content: string;
    phase: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

// ---------- Diagnostic Types ----------

export interface DiagnosticOption {
  label: string;   // "A", "B", "C", "D"
  value: string;   // display text
}

/** Safe (no correctAnswer) question shape returned from generate/precheck */
export interface DiagnosticQuestion {
  id: string;
  strand: string;
  difficulty: 'easy' | 'medium' | 'hard';
  question: string;
  options: DiagnosticOption[];
  examStyle?: string;
}

/** Full question shape with correct answer (returned after submit) */
export interface DiagnosticQuestionResult extends DiagnosticQuestion {
  correctAnswer: string;
  selectedAnswer: string | null;
  isCorrect: boolean;
  explanation: string;
}

export interface DiagnosticGenerateResponse {
  sessionId: string;
  questions: DiagnosticQuestion[];
  totalQuestions: number;
  subjectName: string;
  grade: string;
  examType?: string;
  resumed?: boolean;
}

export interface DiagnosticSubmitResponse {
  sessionId: string;
  strandScores: Record<string, number>;
  overallScore: number;
  weakStrands: string[];
  strongStrands: string[];
  learnerLevel: 'beginner' | 'intermediate' | 'advanced';
  questionResults: DiagnosticQuestionResult[];
}

export interface DiagnosticStatusResponse {
  diagnosed: boolean;
  diagnosticCompletedAt: string | null;
  strandScores: Record<string, number> | null;
  strengthScore: number | null;
}

export interface PrecheckGenerateResponse {
  sessionId: string;
  questions: DiagnosticQuestion[];
  topic: string;
}

// ---------- Notebook Types ----------

export interface NotebookEntry {
  _id: string;
  userId: string;
  question: string;
  imageThumbnail?: string;
  subject: string;
  strand?: string;
  answer: string;
  explanation: string;
  isMath: boolean;
  copyText: string;
  status: 'solved' | 'needs_practice' | 'mastered';
  practiceCount: number;
  lastPracticedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- Catalogue Types ----------

export interface CatalogueEntry {
  id: string;
  label: string;
  description: string;
  provider: string;
  available: boolean;
}

// ---------- Singleton ----------

export const api = new ApiClient(API_BASE);
