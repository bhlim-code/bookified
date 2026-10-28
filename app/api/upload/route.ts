import { auth } from '@clerk/nextjs/server';
import type { HandleUploadBody } from '@vercel/blob/client';
import { handleUpload } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_PDF_TYPES,
  MAX_FILE_SIZE,
} from '@/lib/constants';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      token: process.env.BLOB_READ_WRITE_TOKEN,
      body,
      request,
      onBeforeGenerateToken: async () => {
        const { userId } = await auth();

        if (!userId) {
          throw new Error('Unauthorized: User not authenticated');
        }

        return {
          allowedContentTypes: [...ACCEPTED_PDF_TYPES, ...ACCEPTED_IMAGE_TYPES],
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_FILE_SIZE,
          tokenPayload: JSON.stringify({ userId }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('File uploaded to blob:', blob.url);
        }

        const payload = tokenPayload ? JSON.parse(tokenPayload) : null;
        const userId = payload?.userId;

        // TODO: PostHog
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
