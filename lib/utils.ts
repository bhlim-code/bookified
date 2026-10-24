import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { DEFAULT_VOICE, voiceOptions } from '@/lib/constants';
import type { TextSegment } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Serialize Mongoose documents to plain JSON-safe objects.
// ObjectId and Date values become strings and undefined fields are dropped,
// so the runtime shape differs from T for those fields.
export const serializeData = <T>(data: T): T =>
  JSON.parse(JSON.stringify(data));

// Auto generate slug
export function generateSlug(text: string): string {
  return text
    .replace(/\.(pdf|txt|epub|docx?|md)$/i, '') // Remove a known file extension only
    .normalize('NFD') // Split accented letters into base letter + accent
    .replace(/[\u0300-\u036f]/g, '') // Drop the accents (café -> cafe)
    .toLowerCase() // Convert to lowercase
    .trim() // Remove whitespace from both ends
    .replace(/[^\w\s-]/g, '') // Remove special characters (keep letters, numbers, spaces, hyphens)
    .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
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

      // Convert canvas to data URL
      const coverDataURL = canvas.toDataURL('image/png');
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
