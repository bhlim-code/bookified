import { connection } from 'next/server';
import { Suspense } from 'react';

import BookCard from '@/components/BookCard';
import HeroSection from '@/components/HeroSection';

import { getAllBooks } from '@/lib/actions/book.actions';

const BookGrid = async () => {
  await connection(); // render at request time, not at prerender

  const bookResults = await getAllBooks();
  const books = bookResults.success ? (bookResults.data ?? []) : [];

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
