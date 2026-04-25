import mongoose, { Schema, type Document } from 'mongoose';

/**
 * LearnerProfile tracks the adaptive learning state for each user.
 * This powers the diagnostic assessment engine and adaptive difficulty.
 */

export interface ISubjectProgress {
  subjectId: string;
  subjectName: string;
  lessonsCompleted: number;
  totalLessons: number;
  currentLessonId?: string;
  strengthScore: number;  // 0-100
  weakTopics: string[];
  strongTopics: string[];
  lastAccessedAt?: Date;
  timeSpentMinutes: number;
  /** Per-strand mastery scores (strand name → 0-100). Populated after Tier 1 diagnostic. */
  strandScores?: Record<string, number>;
  /** When the Tier 1 subject diagnostic was last completed. */
  diagnosticCompletedAt?: Date;
}

export interface ILearnerProfile extends Document {
  userId: mongoose.Types.ObjectId;
  diagnosticCompleted: boolean;
  overallLevel: 'beginner' | 'intermediate' | 'advanced';
  subjects: ISubjectProgress[];
  totalXP: number;
  level: number;
  streak: number;        // current consecutive days
  longestStreak: number; // all-time best streak
  lastActiveDate?: Date;
  /** Sorted array of YYYY-MM-DD strings for the last 365 study days */
  studyDays: string[];
  createdAt: Date;
  updatedAt: Date;
}

const subjectProgressSchema = new Schema<ISubjectProgress>(
  {
    subjectId: { type: String, required: true },
    subjectName: { type: String, required: true },
    lessonsCompleted: { type: Number, default: 0 },
    totalLessons: { type: Number, default: 0 },
    currentLessonId: { type: String },
    strengthScore: { type: Number, default: 50, min: 0, max: 100 },
    weakTopics: [{ type: String }],
    strongTopics: [{ type: String }],
    lastAccessedAt: { type: Date },
    timeSpentMinutes: { type: Number, default: 0 },
    strandScores: { type: Object, default: undefined },
    diagnosticCompletedAt: { type: Date },
  },
  { _id: false },
);

const learnerProfileSchema = new Schema<ILearnerProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    diagnosticCompleted: { type: Boolean, default: false },
    overallLevel: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
    },
    subjects: [subjectProgressSchema],
    totalXP: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    streak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastActiveDate: { type: Date },
    studyDays: [{ type: String }],
  },
  { timestamps: true },
);

learnerProfileSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    // Convert strandScores — plain Object, already serialisable, no Map conversion needed
    if (Array.isArray(ret.subjects)) {
      ret.subjects = ret.subjects.map((s: any) => s);
    }
    return ret;
  },
});

export const LearnerProfile = mongoose.model<ILearnerProfile>(
  'LearnerProfile',
  learnerProfileSchema,
);
