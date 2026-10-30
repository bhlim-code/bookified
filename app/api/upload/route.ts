import { auth } from '@clerk/nextjs/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_PDF_TYPES,
  MAX_FILE_SIZE,
} from '@/lib/constants';

// app/api/upload/route.ts
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      // Must match the variable name in .env.local exactly (case-sensitive)
      token: process.env.BLOB_READ_WRITE_TOKEN,
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const { userId } = await auth();

        if (!userId) {
          throw new Error('Unauthorized: User not authenticated');
        }

        // Files must live under "<userId>/", so the delete fallback can tell
        // whose file is whose
        if (!pathname.startsWith(`${userId}/`)) {
          throw new Error('Unauthorized: Invalid upload path');
        }

        return {
          allowedContentTypes: [...ACCEPTED_PDF_TYPES, ...ACCEPTED_IMAGE_TYPES],
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_FILE_SIZE,
          tokenPayload: JSON.stringify({ userId }),
          // callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/upload`,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const { userId } = tokenPayload
          ? (JSON.parse(tokenPayload) as { userId: string })
          : { userId: undefined };

        if (process.env.NODE_ENV === 'development') {
          console.warn('File uploaded to blob:', blob.url, 'by', userId);
        }

        // TODO: PostHog capture here
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : 'An unknown error occurred';
    const status = message.includes('Unauthorized') ? 401 : 500;
    console.error('Upload error', e);
    const clientMessage = status === 401 ? 'Unauthorized' : 'Upload failed';

    return NextResponse.json({ error: clientMessage }, { status });
  }
}
