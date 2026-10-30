import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { DEFAULT_VOICE, voiceOptions } from '@/lib/constants';
import type { TextSegment } from '@/types';

export function cn(...inputs: ClassValue[]) {
  // eslint-disable-next-line tailwindcss/no-custom-classname
  return twMerge(clsx(inputs));
}

// Serialize Mongoose documents to plain JSON-safe objects.
// ObjectId and Date values become strings and undefined fields are dropped,
// so the runtime shape differs from T for those fields.
export const serializeData = <T>(data: T): T =>
  JSON.parse(JSON.stringify(data));

// Auto generate slug
export function generateSlug(text: string): string {
  const slug = text
    .trim() // Trim first so a trailing space doesn't hide the extension
    .replace(/\.(pdf|txt|epub|docx?|md)$/i, '') // Remove a known file extension only
    .normalize('NFD') // Split accented letters into base letter + accent
    .replace(/[\u0300-\u036f]/g, '') // Drop the accents (café -> cafe)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Keep letters, numbers, spaces, hyphens
    .replace(/[\s_]+/g, '-') // Spaces and underscores -> hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens

  return slug || 'book'; // Fallback for titles with no Latin characters
}

// Escape regex special characters so user input is matched literally
// (prevents regex injection when building a RegExp from user input)
export const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Splits text content into segments for MongoDB storage and search
export const splitIntoSegments = (
  text: string,
  segmentSize: number = 500, // Maximum words per segment
  overlapSize: number = 50 // Words to overlap between segments for context
): TextSegment[] => {
  // Validate parameters to prevent infinite loops
  if (segmentSize <= 0) {
    throw new Error('segmentSize must be greater than 0');
  }
  if (overlapSize < 0 || overlapSize >= segmentSize) {
    throw new Error('overlapSize must be >= 0 and < segmentSize');
  }

  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const segments: TextSegment[] = [];

  let segmentIndex = 0;
  let startIndex = 0;

  while (startIndex < words.length) {
    const endIndex = Math.min(startIndex + segmentSize, words.length);
    const segmentWords = words.slice(startIndex, endIndex);
    const segmentText = segmentWords.join(' ');

    segments.push({
      text: segmentText,
      segmentIndex,
      wordCount: segmentWords.length,
    });

    segmentIndex++;

    if (endIndex >= words.length) break;
    startIndex = endIndex - overlapSize;
  }

  return segments;
};

// Get voice data by persona key or voice ID
export const getVoice = (persona?: string) => {
  if (!persona) return voiceOptions[DEFAULT_VOICE];

  // Find by voice ID
  const voiceEntry = Object.values(voiceOptions).find((v) => v.id === persona);
  if (voiceEntry) return voiceEntry;

  // Find by key (own keys only, so 'constructor' or 'toString' can't match)
  if (Object.hasOwn(voiceOptions, persona)) {
    return voiceOptions[persona as keyof typeof voiceOptions];
  }

  // Default fallback
  return voiceOptions[DEFAULT_VOICE];
};

// Format duration in seconds to M:SS format
export const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Browser only: crops near-white margins from a rendered PDF page, so the
// cover is just the artwork. Returns the original canvas when there is nothing
// to trim or the result looks wrong (for example a mostly blank page).
function trimCanvasMargins(
  source: HTMLCanvasElement,
  threshold = 245
): HTMLCanvasElement {
  const ctx = source.getContext('2d');
  if (!ctx) return source;

  const { width, height } = source;
  const { data } = ctx.getImageData(0, 0, width, height);

  const isContent = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return (
      data[i + 3] > 0 &&
      (data[i] < threshold ||
        data[i + 1] < threshold ||
        data[i + 2] < threshold)
    );
  };

  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;

  const rowHasContent = (y: number) => {
    for (let x = 0; x < width; x++) if (isContent(x, y)) return true;
    return false;
  };
  const colHasContent = (x: number) => {
    for (let y = top; y <= bottom; y++) if (isContent(x, y)) return true;
    return false;
  };

  while (top < bottom && !rowHasContent(top)) top++;
  while (bottom > top && !rowHasContent(bottom)) bottom--;
  while (left < right && !colHasContent(left)) left++;
  while (right > left && !colHasContent(right)) right--;

  const newWidth = right - left + 1;
  const newHeight = bottom - top + 1;

  // Full-bleed artwork has content along all four edges of the box. A cover with
  // a white background has mostly white edges: there the white is part of the
  // design, not a page margin, so do not trim it.
  let edgeContent = 0;
  for (let x = left; x <= right; x++) {
    if (isContent(x, top)) edgeContent++;
    if (isContent(x, bottom)) edgeContent++;
  }
  for (let y = top; y <= bottom; y++) {
    if (isContent(left, y)) edgeContent++;
    if (isContent(right, y)) edgeContent++;
  }
  const edgeTotal = 2 * (newWidth + newHeight);

  if (
    edgeContent / edgeTotal < 0.5 ||
    newWidth <= 0 ||
    newHeight <= 0 ||
    (newWidth === width && newHeight === height) ||
    newWidth * newHeight < width * height * 0.5
  ) {
    return source;
  }

  const trimmed = document.createElement('canvas');
  trimmed.width = newWidth;
  trimmed.height = newHeight;
  trimmed
    .getContext('2d')
    ?.drawImage(
      source,
      left,
      top,
      newWidth,
      newHeight,
      0,
      0,
      newWidth,
      newHeight
    );

  return trimmed;
}

// Browser only: makes the cover exactly the card ratio (2:3 by default) by
// adding background around it, so it is never stretched or cropped on screen.
// The background is the colour the artwork has at its corners.
function padToRatio(
  source: HTMLCanvasElement,
  ratio = 2 / 3
): HTMLCanvasElement {
  const { width, height } = source;
  const current = width / height;
  if (Math.abs(current - ratio) < 0.01) return source;

  const ctx = source.getContext('2d');
  if (!ctx) return source;

  // Pick the colour that most corners share (falls back to the top-left corner)
  const corners = [
    ctx.getImageData(0, 0, 1, 1).data,
    ctx.getImageData(width - 1, 0, 1, 1).data,
    ctx.getImageData(0, height - 1, 1, 1).data,
    ctx.getImageData(width - 1, height - 1, 1, 1).data,
  ];
  const close = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
    Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 40;
  const background =
    corners.find((c) => corners.filter((o) => close(c, o)).length >= 2) ??
    corners[0];

  const targetWidth = current < ratio ? Math.round(height * ratio) : width;
  const targetHeight = current < ratio ? height : Math.round(width / ratio);

  const padded = document.createElement('canvas');
  padded.width = targetWidth;
  padded.height = targetHeight;

  const paddedCtx = padded.getContext('2d');
  if (!paddedCtx) return source;

  paddedCtx.fillStyle = `rgb(${background[0]}, ${background[1]}, ${background[2]})`;
  paddedCtx.fillRect(0, 0, targetWidth, targetHeight);
  paddedCtx.drawImage(
    source,
    Math.round((targetWidth - width) / 2),
    Math.round((targetHeight - height) / 2)
  );

  return padded;
}

// Browser only: uses canvas and document. Call it from client components.
export async function parsePDFFile(file: File) {
  try {
    const pdfjsLib = await import('pdfjs-dist');

    if (typeof window !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
    }

    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDocument = await loadingTask.promise;

    try {
      // Render first page as cover image
      const firstPage = await pdfDocument.getPage(1);
      const viewport = firstPage.getViewport({ scale: 2 }); // 2x scale for better quality

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // Newer pdfjs-dist versions render into the canvas itself
      await firstPage.render({ canvas, viewport }).promise;

      // Crop the white page margin (only for full-bleed artwork), fit the card
      // ratio without stretching, then convert the canvas to a data URL
      const coverDataURL = padToRatio(trimCanvasMargins(canvas)).toDataURL(
        'image/png'
      );
      firstPage.cleanup();

      // Extract text from all pages
      let fullText = '';

      for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ');
        fullText += pageText + '\n';
        page.cleanup(); // Free page resources as we go
      }

      // Split text into segments for search
      const segments = splitIntoSegments(fullText);

      return {
        content: segments,
        cover: coverDataURL,
      };
    } finally {
      // Always release PDF resources and the worker, even when parsing fails
      await loadingTask.destroy();
    }
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error(
      `Failed to parse PDF file: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}
