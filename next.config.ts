import type { NextConfig } from 'next';

// Extract and clean the blob store ID from environment variables
// Turns "store_DAoBqAyMao2llYeW" -> "daobqaymao2llyew"
const blobStoreId =
  process.env.BLOB_STORE_ID?.replace(/^store_/, '').toLowerCase() || '';

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: false,
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'covers.openlibrary.org' },
      ...(blobStoreId
        ? [
            {
              protocol: 'https' as const,
              hostname: `${blobStoreId}.public.blob.vercel-storage.com`,
            },
          ]
        : []),
    ],
  },
};

export default nextConfig;
