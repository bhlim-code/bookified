'use client';

import { Loader2 } from 'lucide-react';

const LoadingOverlay = () => {
  return (
    <div className='loading-wrapper'>
      <div className='loading-shadow-wrapper shadow-soft-lg bg-white'>
        <div className='loading-shadow'>
          <Loader2 className='loading-animation h-12 w-12 text-[#663820]' />
          <h2 className='loading-title'>Synthesizing Your Book</h2>
          <p className='max-w-xs text-center text-[#777]'>
            Please wait while we process your PDF and prepare your interactive
            literary experience.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoadingOverlay;
