import { auth } from '@clerk/nextjs/server';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';

import VapiControls from '@/components/VapiControls';

import { getBookBySlug } from '@/lib/actions/book.actions';

// app/(root)/books/[slug]/page.tsx
// auth() and params are request-time data, so with cacheComponents they must
// be read inside a <Suspense> boundary, not at the top of the page.
const BookContent = async ({
  params,
}: Pick<PageProps<'/books/[slug]'>, 'params'>) => {
  // This page reads from the database, so it must render at request time.
  // Without this, Next.js can run the query while prerendering and reports
  // the unstable new Date() used inside Mongoose.
  await connection();

  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  const { slug } = await params;
  const result = await getBookBySlug(slug);

  if (!result.success || !result.data) {
    // Missing, or someone else's book: both look like a normal 404
    if (result.error === 'Book not found') {
      notFound();
    }

    // A real failure (for example the database is down) should not be hidden
    throw new Error('Failed to load the book.');
  }

  return (
    <div className='book-page-container'>
      <Link href='/' className='back-btn-floating' aria-label='Back to library'>
        <ArrowLeft className='size-6 text-[#212a3b]' />
      </Link>

      <VapiControls book={result.data} />
    </div>
  );
};

const BookDetailsPage = ({ params }: PageProps<'/books/[slug]'>) => {
  return (
    <Suspense fallback={<div className='book-page-container' />}>
      <BookContent params={params} />
    </Suspense>
  );
};

export default BookDetailsPage;
