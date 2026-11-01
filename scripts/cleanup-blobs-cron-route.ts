import { timingSafeEqual } from 'node:crypto';

import { del, list } from '@vercel/blob';
import { NextResponse } from 'next/server';

import Book from '@/database/models/book.model';
import { connectToDatabase } from '@/database/mongoose';

export const maxDuration = 60;

// Files newer than this are never touched, so an upload that is still in
// progress (uploaded but the book is not saved yet) is safe
const MIN_AGE_MS = 24 * 60 * 60 * 1000;
// Upper bound for one run, so a bug can never wipe the store in one go
const MAX_DELETES_PER_RUN = 200;

// Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" when the CRON_SECRET
// environment variable is set. Anything else is rejected.
function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const received = request.headers.get('authorization');
  if (!secret || !received) return false;

  const a = Buffer.from(`Bearer ${secret}`);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Decode a path if possible, so both sides of the comparison use the same form
// no matter how a URL or pathname happens to be encoded
function normalize(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function pathOf(value: string): string | null {
  try {
    return normalize(new URL(value).pathname).replace(/^\//, '');
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ?dryRun=true lists what would be deleted without deleting anything
  const dryRun = new URL(request.url).searchParams.get('dryRun') === 'true';

  try {
    await connectToDatabase();

    // Every file a book still points to
    const used = new Set<string>();

    for await (const book of Book.find({})
      .select('fileURL coverURL')
      .lean()
      .cursor()) {
      for (const url of [book.fileURL, book.coverURL]) {
        const path = url ? pathOf(url) : null;
        if (path) used.add(path);
      }
    }

    // An empty list almost always means the wrong database, and every file
    // would then look unused. Stop instead of deleting.
    if (used.size === 0) {
      return NextResponse.json({
        deleted: 0,
        note: 'No book references any file. Nothing was deleted.',
      });
    }

    const cutoff = Date.now() - MIN_AGE_MS;
    const unused: { url: string; pathname: string }[] = [];
    let total = 0;
    let cursor: string | undefined;

    do {
      const page = await list({ cursor, limit: 1000 });
      total += page.blobs.length;

      for (const blob of page.blobs) {
        if (used.has(normalize(blob.pathname))) continue;
        if (new Date(blob.uploadedAt).getTime() > cutoff) continue;
        unused.push({ url: blob.url, pathname: blob.pathname });
      }

      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    const toDelete = unused.slice(0, MAX_DELETES_PER_RUN);

    if (!dryRun) {
      for (let i = 0; i < toDelete.length; i += 100) {
        await del(toDelete.slice(i, i + 100).map((blob) => blob.url));
      }
    }

    return NextResponse.json({
      dryRun,
      filesInStore: total,
      filesInUse: used.size,
      unusedFound: unused.length,
      deleted: dryRun ? 0 : toDelete.length,
      ...(dryRun && { wouldDelete: toDelete.map((blob) => blob.pathname) }),
    });
  } catch (error) {
    console.error('Blob cleanup failed', error);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
