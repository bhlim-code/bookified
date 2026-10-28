'use server';

import { auth } from '@clerk/nextjs/server';
import mongoose from 'mongoose';
import { revalidatePath } from 'next/cache';

import BookSegment from '@/database/models/book-segment.model';
import Book from '@/database/models/book.model';
import { connectToDatabase } from '@/database/mongoose';
import { MAX_FILE_SIZE } from '@/lib/constants';
import { PLAN_LIMITS } from '@/lib/subscription-constants';
import { getUserPlan } from '@/lib/subscription.server';
import { escapeRegex, generateSlug, serializeData } from '@/lib/utils';
import type { CreateBook, IBookSegment, TextSegment } from '@/types';

// Upper bound for one upload (a ~1000 page book is roughly 1000 segments)
const MAX_SEGMENTS_PER_BOOK = 20000;
const MAX_SEARCH_RESULTS = 20;

// Shape of a segment returned by the search queries (only the selected fields)
type SegmentHit = Pick<
  IBookSegment,
  'bookId' | 'content' | 'segmentIndex' | 'pageNumber' | 'wordCount'
> & { _id: mongoose.Types.ObjectId };

// Errors are logged on the server; the client only gets a generic message,
// so database details never reach the browser.
export const getAllBooks = async (search?: string) => {
  try {
    // Each user only sees their own books
    const { userId } = await auth();

    if (!userId) {
      return { success: true, data: [] };
    }

    await connectToDatabase();

    // let query = {};
    const query: Record<string, unknown> = { clerkId: userId };

    if (search) {
      const escapedSearch = escapeRegex(search.slice(0, 100));
      const regex = new RegExp(escapedSearch, 'i');
      query.$or = [{ title: { $regex: regex } }, { author: { $regex: regex } }];
    }

    const books = await Book.find(query).sort({ createdAt: -1 }).lean();

    return {
      success: true,
      data: serializeData(books),
    };
  } catch (e) {
    console.error('Error loading books', e);

    return {
      success: false,
      error: 'Failed to load books. Please try again later.',
    };
  }
};

export const checkBookExists = async (title: string) => {
  try {
    // Signed-out visitors must not be able to look up books
    const { userId } = await auth();

    if (!userId) {
      return { exists: false, error: 'Unauthorized' };
    }

    await connectToDatabase();

    const slug = generateSlug(title);

    // const existingBook = await Book.findOne({ slug }).lean();
    const existingBook = await Book.findOne({ clerkId: userId, slug }).lean();

    if (existingBook) {
      return {
        exists: true,
        book: serializeData(existingBook),
      };
    }

    return {
      exists: false,
    };
  } catch (e) {
    console.error('Error checking book exists', e);

    return {
      exists: false,
      error: 'Failed to check for an existing book.',
    };
  }
};

export const createBook = async (data: CreateBook) => {
  try {
    // Authenticate first: nothing below should run for anonymous callers
    const { userId } = await auth();

    if (!userId || userId !== data.clerkId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!data.title?.trim() || !data.author?.trim()) {
      return { success: false, error: 'Title and author are required.' };
    }

    if (!(data.fileSize > 0 && data.fileSize <= MAX_FILE_SIZE)) {
      return { success: false, error: 'Invalid file size.' };
    }

    const slug = generateSlug(data.title);

    if (!slug) {
      return {
        success: false,
        error: 'Please use a title with letters or numbers.',
      };
    }

    await connectToDatabase();

    // const existingBook = await Book.findOne({ slug }).lean();
    const existingBook = await Book.findOne({ clerkId: userId, slug }).lean();

    if (existingBook) {
      return {
        success: true,
        data: serializeData(existingBook),
        alreadyExists: true,
      };
    }

    // Check subscription limits before creating a book
    const plan = await getUserPlan();
    const limits = PLAN_LIMITS[plan];

    const bookCount = await Book.countDocuments({ clerkId: userId });

    if (bookCount >= limits.maxBooks) {
      revalidatePath('/');

      return {
        success: false,
        error: `You have reached the maximum number of books allowed for your ${plan} plan (${limits.maxBooks}). Please upgrade to add more books.`,
        isBillingError: true,
      };
    }

    let book;

    try {
      // List the fields explicitly: never spread client data into the document
      book = await Book.create({
        clerkId: userId,
        title: data.title.trim(),
        slug,
        author: data.author.trim(),
        persona: data.persona,
        fileURL: data.fileURL,
        fileBlobKey: data.fileBlobKey,
        coverURL: data.coverURL,
        coverBlobKey: data.coverBlobKey,
        fileSize: data.fileSize,
        totalSegments: 0,
      });
    } catch (e) {
      // Two uploads of the same title at once: the unique slug index rejects the second
      if ((e as { code?: number }).code === 11000) {
        const existing = await Book.findOne({ slug }).lean();

        if (existing) {
          return {
            success: true,
            data: serializeData(existing),
            alreadyExists: true,
          };
        }
      }
      throw e;
    }

    return {
      success: true,
      data: serializeData(book),
    };
  } catch (e) {
    console.error('Error creating a book', e);

    return {
      success: false,
      error: 'Failed to create the book. Please try again later.',
    };
  }
};

export const getBookBySlug = async (slug: string) => {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: 'Book not found' };
    }

    await connectToDatabase();

    // const book = await Book.findOne({ slug }).lean();
    // Scoped to the owner: other users' books look like they do not exist
    const book = await Book.findOne({ clerkId: userId, slug }).lean();

    if (!book) {
      return { success: false, error: 'Book not found' };
    }

    return {
      success: true,
      data: serializeData(book),
    };
  } catch (e) {
    console.error('Error fetching book by slug', e);

    return {
      success: false,
      error: 'Failed to load the book. Please try again later.',
    };
  }
};

export const saveBookSegments = async (
  bookId: string,
  clerkId: string,
  segments: TextSegment[]
) => {
  try {
    // Only the owner of a book may add segments to it
    const { userId } = await auth();

    if (!userId || userId !== clerkId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!mongoose.isValidObjectId(bookId)) {
      return { success: false, error: 'Invalid book id.' };
    }

    if (
      !Array.isArray(segments) ||
      segments.length === 0 ||
      segments.length > MAX_SEGMENTS_PER_BOOK
    ) {
      return { success: false, error: 'Invalid book content.' };
    }

    await connectToDatabase();

    if (process.env.NODE_ENV === 'development') {
      console.warn(`Saving ${segments.length} segments for book ${bookId}`);
    }

    const book = await Book.findOne({ _id: bookId, clerkId: userId })
      .select('_id')
      .lean();

    if (!book) {
      return { success: false, error: 'Book not found.' };
    }

    const segmentsToInsert = segments.map(
      ({ text, segmentIndex, pageNumber, wordCount }) => ({
        clerkId: userId,
        bookId,
        content: text,
        segmentIndex,
        pageNumber,
        wordCount,
      })
    );

    // Remove segments left by an earlier failed attempt, so a retry
    // cannot hit the unique { bookId, segmentIndex } index
    await BookSegment.deleteMany({ bookId });

    try {
      await BookSegment.insertMany(segmentsToInsert);
    } catch (e) {
      // Do not leave a half-saved book behind
      await BookSegment.deleteMany({ bookId });
      throw e;
    }

    await Book.updateOne(
      { _id: bookId, clerkId: userId },
      { totalSegments: segments.length }
    );

    if (process.env.NODE_ENV === 'development') {
      console.warn(
        `Saved ${segments.length} segments successfully for book ${bookId}`
      );
    }

    return {
      success: true,
      data: { segmentsCreated: segments.length },
    };
  } catch (e) {
    console.error('Error saving book segments', e);

    return {
      success: false,
      error: 'Failed to save the book content. Please try again later.',
    };
  }
};

// Searches book segments using MongoDB text search with regex fallback
export const searchBookSegments = async (
  bookId: string,
  query: string,
  limit: number = 5
) => {
  try {
    if (!mongoose.isValidObjectId(bookId)) {
      return { success: false, error: 'Invalid book id.', data: [] };
    }

    const searchText = String(query).slice(0, 200);
    const maxResults = Math.min(
      Math.max(Math.floor(limit) || 5, 1),
      MAX_SEARCH_RESULTS
    );

    await connectToDatabase();

    if (process.env.NODE_ENV === 'development') {
      console.warn(`Searching for: "${query}" in book ${bookId}`);
    }

    const bookObjectId = new mongoose.Types.ObjectId(bookId);

    // Try MongoDB text search first (requires text index)
    // let segments: Record<string, unknown>[] = [];
    let segments: SegmentHit[] = [];
    try {
      segments = await BookSegment.find({
        bookId: bookObjectId,
        $text: { $search: searchText },
      })
        .select('_id bookId content segmentIndex pageNumber wordCount')
        .sort({ score: { $meta: 'textScore' } })
        .limit(maxResults)
        .lean<SegmentHit[]>();
    } catch {
      // Text index may not exist: fall through to regex fallback
      segments = [];
    }

    // Fallback: regex search matching ANY keyword
    if (segments.length === 0) {
      const keywords = searchText.split(/\s+/).filter((k) => k.length > 2);

      // An empty pattern would match every segment, so stop here instead
      if (keywords.length === 0) {
        return { success: true, data: [] };
      }

      const pattern = keywords.map(escapeRegex).join('|');

      segments = await BookSegment.find({
        bookId: bookObjectId,
        content: { $regex: pattern, $options: 'i' },
      })
        .select('_id bookId content segmentIndex pageNumber wordCount')
        .sort({ segmentIndex: 1 })
        .limit(maxResults)
        .lean<SegmentHit[]>();
    }

    if (process.env.NODE_ENV === 'development') {
      console.warn(`Search complete. Found ${segments.length} results`);
    }

    return {
      success: true,
      data: serializeData(segments),
    };
  } catch (error) {
    console.error('Error searching segments:', error);

    return {
      success: false,
      error: 'Search failed.',
      data: [],
    };
  }
};
