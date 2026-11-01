import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';

import BookCard from '@/components/BookCard';
import BookCardSkeleton from '@/components/BookCardSkeleton';
import HeroSection from '@/components/HeroSection';
import Search from '@/components/Search';

import { getAllBooks } from '@/lib/actions/book.actions';
import { sampleBooks } from '@/lib/constants';

type SearchParams = Promise<{ query?: string | string[] }>;

// searchParams is request data, so it is read here, inside <Suspense>,
// and not in the page: that keeps the hero and heading prerenderable
const BookGrid = async ({ searchParams }: { searchParams: SearchParams }) => {
  await connection(); // render at request time, not at prerender

  const { query } = await searchParams;
  const search = typeof query === 'string' ? query.trim() : '';

  const bookResults = await getAllBooks(search || undefined);
  const dbBooks = bookResults.success ? (bookResults.data ?? []) : [];

  // Testing only: show the sample books when the database has none
  const useSample =
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_USE_SAMPLE_BOOKS === 'true';

  const books = useSample ? sampleBooks : dbBooks;

  if (books.length === 0) {
    return (
      <p className='py-10 text-center text-[#3d485e]'>
        {search ? (
          <>No books match &ldquo;{search}&rdquo;.</>
        ) : (
          <>
            No books yet.{' '}
            <Link href='/books/new' className='font-medium underline'>
              Add your first book
            </Link>
            .
          </>
        )}
      </p>
    );
  }

  return (
    <div className='library-books-grid'>
      {books.map((book) => (
        <BookCard
          key={String(book._id)}
          title={book.title}
          author={book.author}
          coverURL={book.coverURL}
          slug={book.slug}
        />
      ))}
    </div>
  );
};

const BookGridSkeleton = () => (
  <div className='library-books-grid' role='status' aria-label='Loading books'>
    {Array.from({ length: 8 }, (_, i) => (
      <BookCardSkeleton key={i} />
    ))}
  </div>
);

const Page = ({ searchParams }: { searchParams: SearchParams }) => {
  return (
    <main className='wrapper container'>
      <HeroSection />

      <div className='mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-center'>
        <h2 className='font-serif text-3xl font-bold text-[#212a3b]'>
          Recent Books
        </h2>
        {/* Search reads the URL on the client, so it needs its own boundary */}
        <Suspense fallback={null}>
          <Search />
        </Suspense>
      </div>

      <Suspense fallback={<BookGridSkeleton />}>
        <BookGrid searchParams={searchParams} />
      </Suspense>
    </main>
  );
};

export default Page;
