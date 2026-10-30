'use client';

import { Mic } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { Messages } from '@/types';

interface TranscriptProps {
  messages: Messages[];
  currentMessage: string;
  currentUserMessage: string;
}

// Within this many pixels of the bottom counts as "following the conversation"
const STICK_TO_BOTTOM_THRESHOLD = 80;

const scrollToBottom = (el: HTMLElement, behavior: ScrollBehavior) => {
  el.scrollTo({ top: el.scrollHeight, behavior });
};

const Transcript = ({
  messages,
  currentMessage,
  currentUserMessage,
}: TranscriptProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Becomes false when the user scrolls up to read older messages
  const stickToBottomRef = useRef(true);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;

    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight <
      STICK_TO_BOTTOM_THRESHOLD;
  };

  // Follow new text, but only while the user is at the bottom. 'instant' keeps
  // up with word-by-word streaming; an animated scroll would lag behind and
  // overlap, and it would also override the scroll-smooth class on the list.
  useEffect(() => {
    const el = scrollRef.current;

    if (el && stickToBottomRef.current) {
      scrollToBottom(el, 'instant');
    }
  }, [messages, currentMessage, currentUserMessage]);

  const isEmpty =
    messages.length === 0 && !currentMessage && !currentUserMessage;

  if (isEmpty) {
    return (
      <div className='transcript-empty'>
        <Mic className='mb-4 size-12 text-[#212a3b]' aria-hidden='true' />
        <h2 className='transcript-empty-text'>No conversation yet</h2>
        <p className='transcript-empty-hint'>
          Click the mic button above to start talking
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      role='log'
      aria-label='Conversation transcript'
      className='transcript-messages'
    >
      {/* Messages are only ever appended, so the index is a stable key */}
      {messages.map((message, index) => (
        <div
          key={index}
          className={`transcript-message ${
            message.role === 'user'
              ? 'transcript-message-user'
              : 'transcript-message-assistant'
          }`}
        >
          <div
            className={`transcript-bubble wrap-break-word ${
              message.role === 'user'
                ? 'transcript-bubble-user'
                : 'transcript-bubble-assistant'
            }`}
          >
            {message.content}
          </div>
        </div>
      ))}

      {/* Streaming bubbles are hidden from screen readers: they would read out every word. The finished message is announced instead. */}
      {currentUserMessage && (
        <div
          className='transcript-message transcript-message-user'
          aria-hidden='true'
        >
          <div className='transcript-bubble transcript-bubble-user wrap-break-word'>
            {currentUserMessage}
            <span className='transcript-cursor' />
          </div>
        </div>
      )}

      {/* Assistant Streaming Message */}
      {currentMessage && (
        <div
          className='transcript-message transcript-message-assistant'
          aria-hidden='true'
        >
          <div className='transcript-bubble transcript-bubble-assistant wrap-break-word'>
            {currentMessage}
            <span className='transcript-cursor' />
          </div>
        </div>
      )}
    </div>
  );
};

export default Transcript;
