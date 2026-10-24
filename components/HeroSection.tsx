import Image from 'next/image';
import Link from 'next/link';

const HeroSection = () => {
  return (
    <section className='wrapper mb-10 md:mb-16'>
      <div className='library-hero-card'>
        <div className='library-hero-content'>
          {/* Left Part */}
          <div className='library-hero-text'>
            <h1 className='library-hero-title font-serif text-4xl font-bold'>
              Your Library
            </h1>
            <p className='library-hero-description'>
              Convert your books into interactive AI conversations.{' '}
              <br className='hidden md:block' />
              Listen, learn, and discuss your favorite reads.
            </p>
            <Link
              href='/books/new'
              className='library-cta-primary mt-4 flex items-center justify-center'
            >
              <span className='mr-2 mb-1 text-3xl font-light'>+</span>
              <span className='text-[#212a3b]'>Add new book</span>
            </Link>
          </div>

          {/* Center Part - Desktop */}
          <div className='library-hero-illustration-desktop'>
            <Image
              src='/assets/hero-illustration.png'
              alt='Vintage books and a globe'
              width={400}
              height={400}
              className='object-contain'
            />
          </div>

          {/* Center Part - Mobile (Hidden on Desktop) */}
          <div className='library-hero-illustration'>
            <Image
              src='/assets/hero-illustration.png'
              alt='Vintage books and a globe'
              width={300}
              height={300}
              className='object-contain'
            />
          </div>

          {/* Right Part */}
          <div className='library-steps-card shadow-soft-md z-10 max-w-70 min-w-65'>
            <ul className='space-y-6'>
              <li className='library-step-item'>
                <div className='flex h-10 min-h-10 w-10 min-w-10 items-center justify-center rounded-full border border-gray-300 text-lg font-medium'>
                  1
                </div>
                <div className='flex flex-col'>
                  <h3 className='library-step-title text-lg font-bold'>
                    Upload PDF
                  </h3>
                  <p className='library-step-description text-gray-500'>
                    Add your book file
                  </p>
                </div>
              </li>
              <li className='library-step-item'>
                <div className='flex h-10 min-h-10 w-10 min-w-10 items-center justify-center rounded-full border border-gray-300 text-lg font-medium'>
                  2
                </div>
                <div className='flex flex-col'>
                  <h3 className='library-step-title text-lg font-bold'>
                    AI Processing
                  </h3>
                  <p className='library-step-description text-gray-500'>
                    We analyze the content
                  </p>
                </div>
              </li>
              <li className='library-step-item'>
                <div className='flex h-10 min-h-10 w-10 min-w-10 items-center justify-center rounded-full border border-gray-300 text-lg font-medium'>
                  3
                </div>
                <div className='flex flex-col'>
                  <h3 className='library-step-title text-lg font-bold'>
                    Voice Chat
                  </h3>
                  <p className='library-step-description text-gray-500'>
                    Discuss with AI
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
