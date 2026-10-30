'use client';

import { Mic, MicOff } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

import Transcript from '@/components/Transcript';

import useVapi from '@/hooks/useVapi';
import type { IBook } from '@/types';

const VapiControls = ({ book }: { book: IBook }) => {
  const {
    status,
    isActive,
    messages,
    currentMessage,
    currentUserMessage,
    duration,
    start,
    stop,
    clearError,
    limitError,
    isBillingError,
    maxDurationSeconds,
  } = useVapi(book);
  const router = useRouter();

  useEffect(() => {
    if (limitError) {
      toast.error(limitError);
      if (isBillingError) {
        router.push('/subscriptions');
      } else {
        router.push('/');
      }
      clearError();
    }
  }, [isBillingError, limitError, router, clearError]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusDisplay = () => {
    switch (status) {
      case 'connecting':
        return { label: 'Connecting...', color: 'vapi-status-dot-connecting' };
      case 'starting':
        return { label: 'Starting...', color: 'vapi-status-dot-starting' };
      case 'listening':
        return { label: 'Listening', color: 'vapi-status-dot-listening' };
      case 'thinking':
        return { label: 'Thinking...', color: 'vapi-status-dot-thinking' };
      case 'speaking':
        return { label: 'Speaking', color: 'vapi-status-dot-speaking' };
      default:
        return { label: 'Ready', color: 'vapi-status-dot-ready' };
    }
  };

  const statusDisplay = getStatusDisplay();

  return (
    <>
      <div className='mx-auto flex max-w-4xl flex-col gap-8'>
        {/* Header Card */}
        <div className='vapi-header-card'>
          <div className='vapi-cover-wrapper'>
            <div className='relative aspect-2/3 w-30 shrink-0'>
              <Image
                src={book.coverURL || '/images/book-placeholder.png'}
                alt={book.title}
                fill
                sizes='120px'
                className='vapi-cover-image object-cover'
                priority
              />
            </div>
            {/*<Image
              src={book.coverURL || '/images/book-placeholder.png'}
              alt={book.title}
              width={120}
              height={180}
              className='vapi-cover-image h-auto! w-30!'
              priority
            />*/}
            <div className='vapi-mic-wrapper relative'>
              {isActive && (status === 'speaking' || status === 'thinking') && (
                <div className='absolute inset-0 animate-ping rounded-full bg-white opacity-75' />
              )}
              <button
                onClick={isActive ? stop : start}
                disabled={status === 'connecting'}
                className={`vapi-mic-btn z-10 h-15! w-15! shadow-md ${isActive ? 'vapi-mic-btn-active' : 'vapi-mic-btn-inactive'}`}
              >
                {isActive ? (
                  <Mic className='size-7 text-white' />
                ) : (
                  <MicOff className='size-7 text-[#212a3b]' />
                )}
              </button>
            </div>
          </div>

          <div className='flex flex-1 flex-col gap-4'>
            <div>
              <h1 className='mb-1 font-serif text-2xl font-bold text-[#212a3b] sm:text-3xl'>
                {book.title}
              </h1>
              <p className='font-medium text-[#3d485e]'>by {book.author}</p>
            </div>

            <div className='flex flex-wrap gap-3'>
              <div className='vapi-status-indicator'>
                <span className={`vapi-status-dot ${statusDisplay.color}`} />
                <span className='vapi-status-text'>{statusDisplay.label}</span>
              </div>

              <div className='vapi-status-indicator'>
                <span className='vapi-status-text'>
                  Voice: {book.persona || 'Daniel'}
                </span>
              </div>

              <div className='vapi-status-indicator'>
                <span className='vapi-status-text'>
                  {formatDuration(duration)}/
                  {formatDuration(maxDurationSeconds)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className='vapi-transcript-wrapper'>
          <div className='transcript-container min-h-100'>
            <Transcript
              messages={messages}
              currentMessage={currentMessage}
              currentUserMessage={currentUserMessage}
            />
          </div>
        </div>
      </div>
    </>
  );
};
export default VapiControls;
