const BookCardSkeleton = () => {
  return (
    <div className='animate-pulse space-y-3' aria-hidden='true'>
      <div className='aspect-[2/3] w-full rounded-lg bg-[#8B7355]/15' />
      <div className='h-4 w-3/4 rounded bg-[#8B7355]/15' />
      <div className='h-3 w-1/2 rounded bg-[#8B7355]/10' />
    </div>
  );
};

export default BookCardSkeleton;
