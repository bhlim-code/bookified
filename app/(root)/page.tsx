import BookCard from '@/components/BookCard';
import HeroSection from '@/components/HeroSection';

import { sampleBooks } from '@/lib/constants';

const Page = () => {
  return (
    <main className='wrapper container'>
      <HeroSection />

      <div className='library-books-grid'>
        {sampleBooks.map((book) => (
          <BookCard
            key={book._id}
            title={book.title}
            author={book.author}
            coverURL={book.coverURL}
            slug={book.slug}
          />
        ))}
      </div>
    </main>
  );
};

export default Page;
