// One-off cleanup: finds Vercel Blob files that no book points to anymore
// (for example left behind after the database was dropped or a failed upload).
//
// DELETES by default. Use --dry-run to only print what would be deleted.
//
//   node --env-file=.env.local scripts/cleanup-blobs.mjs --dry-run
//   node --env-file=.env.local scripts/cleanup-blobs.mjs
//
// Options:
//   --dry-run                   only print the unused files, delete nothing
//   --prefix=<userId>/          only look at one user's files
//   --min-age-minutes=<n>       skip files newer than n minutes (default 60)
//   --yes                       skip the confirmation asked when no book exists
//
// When no book references any file (an empty or wrong database), every file
// would count as unused. Deleting then asks you to type the database name., so
//                               an upload that is still in progress is safe
//
// Needs MONGODB_URI and BLOB_READ_WRITE_TOKEN (read from .env.local). It never
// prints either value. Requires Node 20.6+ for --env-file.

import { createInterface } from 'node:readline/promises';

import { del, list } from '@vercel/blob';
import mongoose from 'mongoose';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const shouldDelete = !flag('dry-run');
const skipConfirm = flag('yes');
const prefix = option('prefix', '');
const minAgeMinutes = Number(option('min-age-minutes', '60'));

if (!Number.isFinite(minAgeMinutes) || minAgeMinutes < 0) {
  console.error('--min-age-minutes must be a number of 0 or more.');
  process.exit(1);
}

if (!process.env.MONGODB_URI || !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error(
    'MONGODB_URI and BLOB_READ_WRITE_TOKEN must be set. Run with: node --env-file=.env.local scripts/cleanup-blobs.mjs'
  );
  process.exit(1);
}

// Compare files by their decoded path, so the check does not depend on how a
// URL happens to be encoded
const pathOf = (value) => {
  try {
    return decodeURIComponent(new URL(value).pathname).replace(/^\//, '');
  } catch {
    return null;
  }
};

const formatSize = (bytes) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} kB`;

async function getUsedPaths() {
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });

  const used = new Set();
  const books = mongoose.connection.db
    .collection('books')
    .find({}, { projection: { fileURL: 1, coverURL: 1, title: 1 } });

  let count = 0;
  for await (const book of books) {
    count++;
    for (const url of [book.fileURL, book.coverURL]) {
      const path = url && pathOf(url);
      if (path) used.add(path);
    }
  }

  console.log(
    `Database: ${mongoose.connection.name}, ${count} book(s), ${used.size} file(s) in use`
  );
  return used;
}

async function getAllBlobs() {
  const blobs = [];
  let cursor;

  do {
    const page = await list({
      prefix: prefix || undefined,
      cursor,
      limit: 1000,
    });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return blobs;
}

async function main() {
  const used = await getUsedPaths();

  const blobs = await getAllBlobs();
  console.log(
    `Blob store: ${blobs.length} file(s)${prefix ? ` under "${prefix}"` : ''}`
  );

  const cutoff = Date.now() - minAgeMinutes * 60 * 1000;
  const unused = [];
  let skippedRecent = 0;

  for (const blob of blobs) {
    if (used.has(decodeURIComponent(blob.pathname))) continue;

    if (new Date(blob.uploadedAt).getTime() > cutoff) {
      skippedRecent++;
      continue;
    }

    unused.push(blob);
  }

  if (skippedRecent > 0) {
    console.log(
      `Skipped ${skippedRecent} unused file(s) newer than ${minAgeMinutes} minutes`
    );
  }

  if (unused.length === 0) {
    console.log('No unused files found.');
    return;
  }

  const totalBytes = unused.reduce((sum, blob) => sum + blob.size, 0);

  console.log(`\nUnused files (${unused.length}, ${formatSize(totalBytes)}):`);
  for (const blob of unused) {
    console.log(
      `  ${blob.pathname}  ${formatSize(blob.size)}  ${new Date(blob.uploadedAt).toISOString()}`
    );
  }

  if (!shouldDelete) {
    console.log(
      '\nDry run only. Run again without --dry-run to remove these files.'
    );
    return;
  }

  // With no book at all, every file looks unused. That is correct for an empty
  // database, but also what a wrong MONGODB_URI looks like, so ask first.
  if (used.size === 0 && !skipConfirm) {
    const dbName = mongoose.connection.name;

    if (!process.stdin.isTTY) {
      console.error(
        `No book references any file in "${dbName}". Run in a terminal to confirm, or pass --yes. Nothing was deleted.`
      );
      return;
    }

    console.log(
      `\nWARNING: no book in "${dbName}" references any file, so ALL ${unused.length} files above count as unused.`
    );
    console.log('If that is the wrong database, stop now.');

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = await rl.question(
      `Type the database name (${dbName}) to delete them: `
    );
    rl.close();

    if (answer.trim() !== dbName) {
      console.log('Cancelled. Nothing was deleted.');
      return;
    }
  }

  // Delete in small batches
  for (let i = 0; i < unused.length; i += 100) {
    const batch = unused.slice(i, i + 100).map((blob) => blob.url);
    await del(batch);
    console.log(`Deleted ${Math.min(i + 100, unused.length)}/${unused.length}`);
  }

  console.log('Done.');
}

main()
  .catch((error) => {
    // Print the message only: errors from the database driver can include the URI
    console.error('Cleanup failed:', error?.message ?? 'unknown error');
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
