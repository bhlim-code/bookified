import 'server-only';

import mongoose from 'mongoose';

import BookSegment from '@/database/models/book-segment.model';
import { connectToDatabase } from '@/database/mongoose';
import { escapeRegex, serializeData } from '@/lib/utils';
import type { IBookSegment } from '@/types';

const MAX_SEARCH_RESULTS = 20;

// Shape of a segment returned by the search queries (only the selected fields)
type SegmentHit = Pick<
  IBookSegment,
  'bookId' | 'content' | 'segmentIndex' | 'pageNumber' | 'wordCount'
> & { _id: mongoose.Types.ObjectId };

// Searches book segments using MongoDB text search with regex fallback.
// This is NOT a server action: it has no user check, because it is only called
// by the Vapi webhook route (which verifies a shared secret first). Keeping it
// out of a 'use server' file means the browser can never call it directly.
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
