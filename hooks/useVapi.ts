'use client';

import { useAuth } from '@clerk/nextjs';
import Vapi from '@vapi-ai/web';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

import { useSubscription } from '@/hooks/useSubscription';
import {
  startVoiceSession,
  endVoiceSession,
  cancelVoiceSession,
} from '@/lib/actions/session.actions';
import { ASSISTANT_ID, DEFAULT_VOICE, VOICE_SETTINGS } from '@/lib/constants';
import { getVoice } from '@/lib/utils';
import type { IBook, Messages } from '@/types';

// A message with a stable id, so the UI can use it as a React key
export type ChatMessage = Messages & { id: string };

function useLatestRef<T>(value: T) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

const VAPI_API_KEY = process.env.NEXT_PUBLIC_VAPI_API_KEY;
const TIMER_INTERVAL_MS = 1000;
const SECONDS_PER_MINUTE = 60;
const DEFAULT_MAX_DURATION_SECONDS = 15 * SECONDS_PER_MINUTE;
// Show the "time is almost up" warning when this many seconds remain
const TIME_WARNING_THRESHOLD_SECONDS = 60;
// Vapi's own cap is a backstop: it ends the call a little after our timer,
// so the friendly "time limit reached" message normally shows first
const VAPI_MAX_DURATION_GRACE_SECONDS = 10;

let messageCounter = 0;
const nextMessageId = () => `m${++messageCounter}`;

// True when an error message looks like a blocked microphone
const isPermissionMessage = (message: string) =>
  message.includes('permission') ||
  message.includes('denied') ||
  message.includes('notallowed') ||
  message.includes('not allowed') ||
  message.includes('microphone');

const MIC_BLOCKED_MESSAGE =
  'Microphone access is blocked. Please allow the microphone in your browser and try again.';

// Joins two chunks of one spoken turn into a single, clean piece of text
function joinTranscript(previous: string, next: string) {
  const a = previous.replace(/\s+/g, ' ').trim();
  const b = next.replace(/\s+/g, ' ').trim();

  if (!a) return b;
  if (!b) return a;

  // Exact repeat of what is already shown
  if (a === b) return a;

  // The new chunk already contains the previous text (a growing sentence),
  // so use it instead of showing the same words twice
  if (b.startsWith(a)) return b;

  return `${a} ${b}`;
}

// Display only: shows the opening message as one bubble per sentence
// ("Hey, good to meet you." / "Quick question before we dive in." / the
// question). Later replies stay as single bubbles. A split happens after a
// period followed by a space, never after "?".
function splitOpeningMessage(messages: ChatMessage[]): ChatMessage[] {
  const first = messages[0];
  if (!first || first.role !== 'assistant') return messages;

  const parts = first.content
    .split(/(?<=\.)\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return messages;

  return [
    ...parts.map((content, i) => ({
      ...first,
      id: `${first.id}-${i}`,
      content,
    })),
    ...messages.slice(1),
  ];
}

let vapi: InstanceType<typeof Vapi> | null = null;
function getVapi() {
  if (!vapi) {
    if (!VAPI_API_KEY) {
      throw new Error(
        'NEXT_PUBLIC_VAPI_API_KEY environment variable is not set'
      );
    }
    vapi = new Vapi(VAPI_API_KEY);
  }
  return vapi;
}

export type CallStatus =
  'idle' | 'connecting' | 'starting' | 'listening' | 'thinking' | 'speaking';

export function useVapi(book: IBook) {
  const { userId } = useAuth();
  const { limits } = useSubscription();

  const [status, setStatus] = useState<CallStatus>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [currentUserMessage, setCurrentUserMessage] = useState('');
  const [duration, setDuration] = useState(0);
  const [limitError, setLimitError] = useState<string | null>(null);
  const [isBillingError, setIsBillingError] = useState(false);
  // The limit returned by the server when the session started (authoritative)
  const [serverMaxSeconds, setServerMaxSeconds] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const isStoppingRef = useRef(false);
  const isStartingRef = useRef(false);

  // Use the server's limit once a session has started. Before that, fall back
  // to the plan limits from the client (used for display only).
  const planMaxSeconds = limits?.maxDurationPerSession
    ? limits.maxDurationPerSession * SECONDS_PER_MINUTE
    : DEFAULT_MAX_DURATION_SECONDS;
  const maxDurationSeconds = serverMaxSeconds ?? planMaxSeconds;
  const maxDurationRef = useLatestRef(maxDurationSeconds);
  const voice = book.persona || DEFAULT_VOICE;

  // What the UI shows: the merged messages, with the opening split into bubbles
  const displayMessages = useMemo(
    () => splitOpeningMessage(messages),
    [messages]
  );

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Closes the server-side session record exactly once.
  // - the call really started -> record how long it ran
  // - the call never started  -> remove it, so a failed start does not
  //   count against the monthly session limit
  const closeCurrentSession = useCallback(() => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    sessionIdRef.current = null;

    if (startTimeRef.current) {
      const seconds = Math.floor(
        (Date.now() - startTimeRef.current) / TIMER_INTERVAL_MS
      );
      endVoiceSession(sessionId, seconds).catch((err) =>
        console.error('Failed to end voice session:', err)
      );
    } else {
      cancelVoiceSession(sessionId).catch((err) =>
        console.error('Failed to cancel voice session:', err)
      );
    }
  }, []);

  // Set up Vapi event listeners
  useEffect(() => {
    let client: InstanceType<typeof Vapi>;

    try {
      client = getVapi();
    } catch (err) {
      // start() reports this to the user when they try to begin a call
      console.error(err);
      return;
    }

    const handlers = {
      'call-start': () => {
        isStoppingRef.current = false;
        setStatus('starting'); // AI speaks first, wait for it
        setCurrentMessage('');
        setCurrentUserMessage('');

        // Start duration timer
        startTimeRef.current = Date.now();
        setDuration(0);
        timerRef.current = setInterval(() => {
          if (!startTimeRef.current) return;

          const newDuration = Math.floor(
            (Date.now() - startTimeRef.current) / TIMER_INTERVAL_MS
          );
          setDuration(newDuration);

          // Check duration limit (stop only once, then wait for call-end)
          if (newDuration >= maxDurationRef.current && !isStoppingRef.current) {
            isStoppingRef.current = true;
            clearTimer();
            // Lets the UI offer the upgrade button next to the message
            setIsBillingError(true);
            setLimitError(
              `Session time limit (${Math.floor(
                maxDurationRef.current / SECONDS_PER_MINUTE
              )} minutes) reached. Upgrade your plan for longer sessions.`
            );
            client.stop();
          }
        }, TIMER_INTERVAL_MS);
      },

      'call-end': () => {
        // Don't reset isStoppingRef here - delayed events may still fire
        setStatus('idle');
        setCurrentMessage('');
        setCurrentUserMessage('');

        clearTimer();
        closeCurrentSession();
        startTimeRef.current = null;
      },

      'speech-start': () => {
        if (!isStoppingRef.current) {
          setStatus('speaking');
        }
      },
      'speech-end': () => {
        if (!isStoppingRef.current) {
          // After AI finishes speaking, user can talk
          setStatus('listening');
        }
      },

      message: (message: {
        type: string;
        role: string;
        transcriptType: string;
        transcript: string;
      }) => {
        if (message.type !== 'transcript') return;

        // User finished speaking → AI is thinking
        if (message.role === 'user' && message.transcriptType === 'final') {
          if (!isStoppingRef.current) {
            setStatus('thinking');
          }
          setCurrentUserMessage('');
        }

        // Partial user transcript → show real-time typing
        if (message.role === 'user' && message.transcriptType === 'partial') {
          setCurrentUserMessage(message.transcript);
          return;
        }

        // Partial AI transcript → show word-by-word
        if (
          message.role === 'assistant' &&
          message.transcriptType === 'partial'
        ) {
          setCurrentMessage(message.transcript);
          return;
        }

        // Final transcript → add to messages
        if (message.transcriptType === 'final') {
          if (message.role === 'assistant') setCurrentMessage('');
          if (message.role === 'user') setCurrentUserMessage('');

          setMessages((prev) => {
            const last = prev[prev.length - 1];

            // Same speaker as the last bubble: Vapi can send one spoken turn
            // as several final chunks, so continue the bubble instead of
            // starting a new one
            if (last?.role === message.role) {
              const merged = joinTranscript(last.content, message.transcript);

              // Nothing new to show (an exact repeat)
              if (merged === last.content) return prev;

              return [...prev.slice(0, -1), { ...last, content: merged }];
            }

            return [
              ...prev,
              {
                id: nextMessageId(),
                role: message.role as Messages['role'],
                content: joinTranscript('', message.transcript),
              },
            ];
          });
        }
      },

      error: (error: Error) => {
        console.error('Vapi error:', error);
        // Don't reset isStoppingRef here - delayed events may still fire.
        // Stop the call too: an error must not leave it running (and billed).
        isStoppingRef.current = true;
        try {
          client.stop();
        } catch {
          // Nothing to stop
        }

        setStatus('idle');
        setCurrentMessage('');
        setCurrentUserMessage('');

        clearTimer();
        closeCurrentSession();

        // Show user-friendly error message
        const errorMessage = String(error?.message ?? '').toLowerCase();
        if (isPermissionMessage(errorMessage)) {
          setLimitError(MIC_BLOCKED_MESSAGE);
        } else if (
          errorMessage.includes('timeout') ||
          errorMessage.includes('silence')
        ) {
          setLimitError(
            'Session ended due to inactivity. Click the mic to start again.'
          );
        } else if (
          errorMessage.includes('network') ||
          errorMessage.includes('connection')
        ) {
          setLimitError(
            'Connection lost. Please check your internet and try again.'
          );
        } else {
          setLimitError(
            'Session ended unexpectedly. Click the mic to start again.'
          );
        }

        startTimeRef.current = null;
      },
    };

    // Register all handlers
    Object.entries(handlers).forEach(([event, handler]) => {
      client.on(event as keyof typeof handlers, handler as () => void);
    });

    // Closing the tab or leaving the site does not run the unmount cleanup,
    // so end the call here too. This is best effort: the request may not
    // finish, so the server should also expire sessions that never ended.
    const onPageHide = () => {
      if (sessionIdRef.current) {
        try {
          client.stop();
        } catch {
          // Nothing to stop
        }
        closeCurrentSession();
      }
    };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.removeEventListener('pagehide', onPageHide);

      // End active session on unmount
      if (sessionIdRef.current) {
        try {
          client.stop();
        } catch {
          // Nothing to stop
        }
        closeCurrentSession();
      }
      // Cleanup handlers
      Object.entries(handlers).forEach(([event, handler]) => {
        client.off(event as keyof typeof handlers, handler as () => void);
      });
      clearTimer();
    };
  }, [clearTimer, closeCurrentSession, maxDurationRef]);

  const start = useCallback(async () => {
    if (!userId) {
      setLimitError('Please sign in to start a voice session.');
      return;
    }

    // Ignore a second click while a call is starting or running: each start
    // creates a session that counts against the monthly limit
    if (isStartingRef.current || sessionIdRef.current) return;
    isStartingRef.current = true;

    setLimitError(null);
    setIsBillingError(false);
    setStatus('connecting');

    try {
      // Fail early (before a session is created) if the key is missing
      const client = getVapi();

      // The book comes from serializeData, so _id is already a string at
      // runtime; String() also satisfies the ObjectId type
      const bookId = String(book._id);

      // Check session limits and create session record
      const result = await startVoiceSession(bookId);

      if (!result.success) {
        setLimitError(
          result.error || 'Session limit reached. Please upgrade your plan.'
        );
        setIsBillingError(!!result.isBillingError);
        setStatus('idle');
        return;
      }

      sessionIdRef.current = result.sessionId || null;

      // The server's limit is the one enforced by the timer. Reset it when the
      // server sends none, so an old value from a previous session is not reused
      setServerMaxSeconds(
        result.maxDurationMinutes
          ? result.maxDurationMinutes * SECONDS_PER_MINUTE
          : null
      );

      // Each call starts with a clean transcript, so the opening message is
      // always the first bubble (and the split below applies to it)
      setMessages([]);

      // Written with sentence punctuation: the opening is shown as one bubble
      // per sentence (see splitOpeningMessage)
      const firstMessage = `Hey, good to meet you. Quick question before we dive in. Have you actually read ${book.title} yet? Or are we starting fresh?`;

      await client.start(ASSISTANT_ID, {
        // Also enforce the plan limit on Vapi's side, so editing this page in
        // the browser cannot extend the call
        ...(result.maxDurationMinutes
          ? {
              maxDurationSeconds:
                result.maxDurationMinutes * SECONDS_PER_MINUTE +
                VAPI_MAX_DURATION_GRACE_SECONDS,
            }
          : {}),
        firstMessage,
        variableValues: {
          title: book.title,
          author: book.author,
          bookId,
        },
        voice: {
          provider: '11labs' as const,
          voiceId: getVoice(voice).id,
          model: 'eleven_turbo_v2_5' as const,
          stability: VOICE_SETTINGS.stability,
          similarityBoost: VOICE_SETTINGS.similarityBoost,
          style: VOICE_SETTINGS.style,
          useSpeakerBoost: VOICE_SETTINGS.useSpeakerBoost,
        },
      });
    } catch (err) {
      console.error('Failed to start call:', err);
      // The call never started: remove the session so it is not counted
      closeCurrentSession();
      setStatus('idle');

      const errorMessage = String(
        (err as { message?: string })?.message ?? ''
      ).toLowerCase();
      setLimitError(
        isPermissionMessage(errorMessage)
          ? MIC_BLOCKED_MESSAGE
          : 'Failed to start voice session. Please try again.'
      );
    } finally {
      isStartingRef.current = false;
    }
  }, [book._id, book.title, book.author, voice, userId, closeCurrentSession]);

  const stop = useCallback(() => {
    isStoppingRef.current = true;
    try {
      getVapi().stop();
    } catch {
      // Nothing to stop
    }
  }, []);

  const clearError = useCallback(() => {
    setLimitError(null);
    setIsBillingError(false);
  }, []);

  const isActive =
    status === 'starting' ||
    status === 'listening' ||
    status === 'thinking' ||
    status === 'speaking';

  // Time left in the session, and when to warn the user
  const remainingSeconds = Math.max(0, maxDurationSeconds - duration);
  const showTimeWarning =
    isActive &&
    remainingSeconds > 0 &&
    remainingSeconds <= TIME_WARNING_THRESHOLD_SECONDS;

  return {
    status,
    isActive,
    messages: displayMessages,
    currentMessage,
    currentUserMessage,
    duration,
    start,
    stop,
    limitError,
    isBillingError,
    maxDurationSeconds,
    remainingSeconds,
    showTimeWarning,
    clearError,
  };
}

export default useVapi;
