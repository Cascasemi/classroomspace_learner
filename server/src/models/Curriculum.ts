import mongoose, { Schema, type Document } from 'mongoose';

/**
 * Curriculum model — stores pre-loaded course materials per grade.
 * Each document represents one course within a grade.
 */

export interface ICurriculum extends Document {
  grade: string;               // e.g. "Grade 3", "Grade 9", "AP"
  subjectName: string;         // e.g. "Mathematics", "Biology"
  subjectId: string;           // unique slug e.g. "grade-3-math"
  description: string;
  pdfUrl: string;              // path or URL to curriculum PDF
  pdfText?: string;            // extracted text for generation pipeline
  totalLessons: number;
  topics: string[];            // high-level topic list
  examType?: string;           // "EOG" | "EOC" | "AP" | null
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const curriculumSchema = new Schema<ICurriculum>(
  {
    grade: { type: String, required: true, trim: true },
    subjectName: { type: String, required: true, trim: true },
    subjectId: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    pdfUrl: { type: String, required: true },
    pdfText: { type: String },
    totalLessons: { type: Number, default: 0 },
    topics: [{ type: String }],
    examType: { type: String, enum: ['EOG', 'EOC', 'AP', null] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

curriculumSchema.index({ grade: 1, subjectId: 1 });

curriculumSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Curriculum = mongoose.model<ICurriculum>('Curriculum', curriculumSchema);
