import { connection } from 'next/server';
import { Suspense } from 'react';

import BookCard from '@/components/BookCard';
import HeroSection from '@/components/HeroSection';

import { getAllBooks } from '@/lib/actions/book.actions';
import { sampleBooks } from '@/lib/constants';

const BookGrid = async () => {
  await connection(); // render at request time, not at prerender

  const bookResults = await getAllBooks();
  const dbBooks = bookResults.success ? (bookResults.data ?? []) : [];

  // Testing only: show the sample books when the database has none
  const useSample =
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_USE_SAMPLE_BOOKS === 'true';

  const books = useSample ? sampleBooks : dbBooks;

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

const Page = () => {
  // const { query } = await searchParams;

  return (
    <main className='wrapper container'>
      <HeroSection />

      <Suspense fallback={<div className='library-books-grid' />}>
        <BookGrid />
      </Suspense>
    </main>
  );
};

export default Page;
