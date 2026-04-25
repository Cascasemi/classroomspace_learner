import mongoose, { Schema, type Document } from 'mongoose';
import bcrypt from 'bcryptjs';

// ---------- Types ----------

export type AccountType = 'parent' | 'student';
export type SubscriptionTier = 'free' | 'premium';

export interface IUser extends Document {
  email: string;
  password: string;
  accountType: AccountType;
  subscription: SubscriptionTier;
  onboardingCompleted: boolean;
  freeClassroomsUsed: number; // max 3 for free tier

  // Profile fields (filled during onboarding)
  preferredName?: string;
  age?: number;
  grade?: string;
  programOfStudy?: string;
  school?: string;
  avatarUrl?: string;

  /**
   * Premium only — the model ID the user prefers for AI generation.
   * One of: 'gemini-2.0-flash' | 'gemini-1.5-pro' | 'gpt-4o-mini' | 'gpt-4o'
   * Free users always use gemini-2.0-flash regardless of this field.
   */
  preferredModel?: string;

  // Parent-specific: children linked to this account
  children: mongoose.Types.ObjectId[];

  // If this is a child account, who is the parent
  parentId?: mongoose.Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;

  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
}

// ---------- Schema ----------

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false, // never returned by default
    },
    accountType: {
      type: String,
      enum: ['parent', 'student'],
      required: true,
    },
    subscription: {
      type: String,
      enum: ['free', 'premium'],
      default: 'free',
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
    freeClassroomsUsed: {
      type: Number,
      default: 0,
    },

    // Profile
    preferredName: { type: String, trim: true },
    age: { type: Number, min: 4, max: 100 },
    grade: { type: String, trim: true },
    programOfStudy: { type: String, trim: true },
    school: { type: String, trim: true },
    avatarUrl: { type: String },

    // AI model preference (premium only — free tier always uses Gemini Flash)
    preferredModel: {
      type: String,
      enum: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gpt-4o-mini', 'gpt-4o'],
      default: undefined,
    },

    // Relationships
    children: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    parentId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
  },
);

// ---------- Pre-save: Hash password ----------

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ---------- Methods ----------

userSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// ---------- JSON transform ----------

userSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    delete ret.password;
    return ret;
  },
});

export const User = mongoose.model<IUser>('User', userSchema);
