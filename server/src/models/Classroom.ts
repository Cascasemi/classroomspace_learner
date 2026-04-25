import mongoose, { Schema, type Document } from 'mongoose';
import type { Scene, AgentConfig, MediaTask } from '../generation/types';

/**
 * Classroom model — stores a generated (or in-progress) classroom session.
 *
 * Each classroom contains the full set of scenes produced by the generation
 * pipeline, along with user progress tracking.
 */

export interface IClassroomProgress {
  currentSceneIndex: number;
  currentActionIndex: number;
  completedScenes: string[];       // scene IDs
  quizResults: IQuizResult[];
  startedAt: Date;
  lastAccessedAt: Date;
  totalTimeSpentMs: number;
}

export interface IQuizResult {
  sceneId: string;
  answers: Record<string, string[]>;   // questionId → selected answers
  score: number;                        // percentage 0-100
  completedAt: Date;
}

export interface IGenerationState {
  progress: number;          // 0-100
  message: string;
  scenesCompleted: number;
  totalScenes: number;
}

export interface IClassroom extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  subjectId?: string;
  grade?: string;
  scenes: Scene[];
  agentConfigs: AgentConfig[];
  mediaTasks: MediaTask[];
  status: 'generating' | 'ready' | 'error';
  isCustom: boolean;                    // true if generated from free-form topic
  customTopic?: string;
  progress: IClassroomProgress;
  generation: IGenerationState;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const quizResultSchema = new Schema<IQuizResult>(
  {
    sceneId: { type: String, required: true },
    answers: { type: Schema.Types.Mixed, default: {} },
    score: { type: Number, default: 0 },
    completedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const classroomProgressSchema = new Schema<IClassroomProgress>(
  {
    currentSceneIndex: { type: Number, default: 0 },
    currentActionIndex: { type: Number, default: 0 },
    completedScenes: [{ type: String }],
    quizResults: [quizResultSchema],
    startedAt: { type: Date, default: Date.now },
    lastAccessedAt: { type: Date, default: Date.now },
    totalTimeSpentMs: { type: Number, default: 0 },
  },
  { _id: false },
);

/**
 * Scene sub-documents use Mixed type because the content structure
 * varies between lesson and quiz types. Typed at the application layer.
 */
const classroomSchema = new Schema<IClassroom>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    subjectId: { type: String },
    grade: { type: String },
    scenes: [{ type: Schema.Types.Mixed }],
    agentConfigs: [{ type: Schema.Types.Mixed }],
    mediaTasks: [{ type: Schema.Types.Mixed }],
    status: {
      type: String,
      enum: ['generating', 'ready', 'error'],
      default: 'generating',
    },
    isCustom: { type: Boolean, default: false },
    customTopic: { type: String },
    progress: {
      type: classroomProgressSchema,
      default: () => ({
        currentSceneIndex: 0,
        currentActionIndex: 0,
        completedScenes: [],
        quizResults: [],
        startedAt: new Date(),
        lastAccessedAt: new Date(),
        totalTimeSpentMs: 0,
      }),
    },
    errorMessage: { type: String },
    generation: {
      type: new Schema<IGenerationState>(
        {
          progress: { type: Number, default: 0 },
          message: { type: String, default: 'Starting...' },
          scenesCompleted: { type: Number, default: 0 },
          totalScenes: { type: Number, default: 0 },
        },
        { _id: false },
      ),
      default: () => ({ progress: 0, message: 'Starting...', scenesCompleted: 0, totalScenes: 0 }),
    },
  },
  { timestamps: true },
);

// User's classrooms, most recent first
classroomSchema.index({ userId: 1, createdAt: -1 });

classroomSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Classroom = mongoose.model<IClassroom>('Classroom', classroomSchema);
