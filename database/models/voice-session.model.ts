import { model, models, Schema, type Model } from 'mongoose';

import type { IVoiceSession } from '@/types';

const VoiceSessionSchema = new Schema<IVoiceSession>(
  {
    clerkId: { type: String, required: true },
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true },
    startedAt: { type: Date, required: true, default: Date.now },
    endedAt: { type: Date },
    durationSeconds: { type: Number, default: 0, required: true },
    billingPeriodStart: { type: Date, required: true },
  },
  { timestamps: true }
);

// Usage per user per billing period. This compound index also covers
// queries on clerkId alone, so no separate single-field indexes.
VoiceSessionSchema.index({ clerkId: 1, billingPeriodStart: 1 });

const VoiceSession =
  (models.VoiceSession as Model<IVoiceSession>) ||
  model<IVoiceSession>('VoiceSession', VoiceSessionSchema);

export default VoiceSession;
