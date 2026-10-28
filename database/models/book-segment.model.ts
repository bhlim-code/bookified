import { model, models, Schema, type Model } from 'mongoose';

import type { IBookSegment } from '@/types';

const BookSegmentSchema = new Schema<IBookSegment>(
  {
    clerkId: { type: String, required: true },
    bookId: {
      type: Schema.Types.ObjectId,
      ref: 'Book',
      required: true,
    },
    content: { type: String, required: true },
    segmentIndex: { type: Number, required: true },
    pageNumber: { type: Number },
    wordCount: { type: Number, required: true },
  },
  { timestamps: true }
);

// Clean Code -> atomic functions -> segment -> dive deeper

// The compound indexes below also serve queries on bookId alone (prefix),
// so single-field indexes on bookId, segmentIndex and pageNumber are not needed.
BookSegmentSchema.index({ bookId: 1, segmentIndex: 1 }, { unique: true });
BookSegmentSchema.index({ bookId: 1, pageNumber: 1 });

BookSegmentSchema.index({ bookId: 1, content: 'text' });

const BookSegment =
  (models.BookSegment as Model<IBookSegment>) ||
  model<IBookSegment>('BookSegment', BookSegmentSchema);

export default BookSegment;
