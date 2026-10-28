'use client';

import { Show, SignInButton, UserButton, useUser } from '@clerk/nextjs';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Library', href: '/' },
  { label: 'Add New', href: '/books/new' },
];

const Navbar = () => {
  const pathName = usePathname();
  const { user } = useUser();

  return (
    <header className='fixed z-50 w-full bg-(--bg-primary)'>
      <div className='wrapper navbar-height flex items-center justify-between py-4'>
        <Link href='/' className='flex items-center gap-0.5'>
          {/* File is 86x52 (2x of the 42px display size); preflight sets height:auto */}
          <Image
            src='/assets/logo.png'
            alt='Bookified'
            width={86}
            height={52}
            style={{ width: 42, height: 'auto' }}
          />
          <span className='logo-text'>Bookified</span>
        </Link>

        <nav className='flex w-fit items-center gap-7.5'>
          {navItems.map(({ label, href }) => {
            const isActive =
              pathName === href || (href !== '/' && pathName.startsWith(href));

            return (
              <Link
                href={href}
                key={label}
                className={cn(
                  'nav-link-base',
                  isActive ? 'nav-link-active' : 'text-black hover:opacity-70'
                )}
              >
                {label}
              </Link>
            );
          })}
          <div className='flex items-center gap-7.5'>
            <Show when='signed-out'>
              <SignInButton mode='modal' />
            </Show>
            <Show when='signed-in'>
              <div className='nav-user-link'>
                <UserButton />
                {user?.firstName && (
                  <Link href='/subscriptions' className='nav-user-name'>
                    {user.firstName}
                  </Link>
                )}
              </div>
            </Show>
          </div>
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
