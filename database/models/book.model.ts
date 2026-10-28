import { model, models, Schema, type Model } from 'mongoose';

import type { IBook } from '@/types';

const BookSchema = new Schema<IBook>(
  {
    clerkId: { type: String, required: true },
    title: { type: String, required: true },
    slug: {
      type: String,
      required: true,
      unique: true,
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

// Reuse the compiled model during hot reloads; the cast keeps it typed
const Book = (models.Book as Model<IBook>) || model<IBook>('Book', BookSchema);

export default Book;
