import { model, models, Schema, type Model } from 'mongoose';

import type { IBook } from '@/types';

const BookSchema = new Schema<IBook>(
  {
    clerkId: { type: String, required: true },
    title: { type: String, required: true },
    // Unique per user (see the compound index below), not across all users
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    author: { type: String, required: true },
    persona: { type: String },
    fileURL: { type: String, required: true },
    fileBlobKey: { type: String, required: true },
    // The upload form always supplies a cover (uploaded or generated from the PDF)
    coverURL: { type: String, required: true },
    coverBlobKey: { type: String },
    fileSize: { type: Number, required: true },
    totalSegments: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Each user can have one book per slug; different users can share a title.
// Also serves the library list: queries by clerkId.
BookSchema.index({ clerkId: 1, slug: 1 }, { unique: true });

// Reuse the compiled model during hot reloads; the cast keeps it typed
const Book = (models.Book as Model<IBook>) || model<IBook>('Book', BookSchema);

export default Book;
