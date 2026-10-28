import { clerkMiddleware } from '@clerk/nextjs/server';

// Next.js 16 calls this file "proxy.ts" (it was "middleware.ts" before).
// Put it in the project root, next to package.json and the app folder.
// Without it, auth() throws "Clerk can't detect usage of clerkMiddleware()".
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Always run for Clerk-specific frontend API routes
    '/__clerk/(.*)',
  ],
};
