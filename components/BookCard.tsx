import Image from 'next/image';
import Link from 'next/link';

interface BookCardProps {
  title: string;
  author: string;
  coverURL: string;
  slug: string;
}

const BookCard = ({ title, author, coverURL, slug }: BookCardProps) => {
  return (
    <Link href={`/books/${slug}`} className='block h-full'>
      <article className='book-card'>
        <figure className='book-card-figure'>
          <div className='book-card-cover-wrapper'>
            {coverURL ? (
              <Image
                src={coverURL}
                alt={title}
                width={133}
                height={200}
                className='book-card-cover'
              />
            ) : (
              <div
                className='book-card-cover aspect-2/3 bg-(--bg-secondary)'
                role='img'
                aria-label={`No cover for ${title}`}
              />
            )}
          </div>

          <figcaption className='book-card-meta'>
            <h3 className='book-card-title'>{title}</h3>
            <p className='book-card-author'>{author}</p>
          </figcaption>
        </figure>
      </article>
    </Link>
  );
};

export default BookCard;
