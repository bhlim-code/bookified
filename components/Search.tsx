'use client';

import { Search as SearchIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useDebouncedCallback } from 'use-debounce';

import { Input } from '@/components/ui/input';

const Search = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const handleSearch = useDebouncedCallback((term: string) => {
    const params = new URLSearchParams(window.location.search);
    const next = term.trim();

    if (next) {
      params.set('query', next);
    } else {
      params.delete('query');
    }

    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  }, 300);

  return (
    <div className='library-search-wrapper'>
      <div className='pl-4'>
        <SearchIcon size={20} className='text-(--text-muted)' />
      </div>
      <Input
        type='text'
        placeholder='Search books by title or author'
        className='library-search-input border-none shadow-none focus-visible:ring-0'
        defaultValue={searchParams.get('query') ?? ''}
        onChange={(e) => handleSearch(e.target.value)}
      />
    </div>
  );
};

export default Search;
