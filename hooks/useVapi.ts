'use client';

import { useAuth } from '@clerk/nextjs';
import Vapi from '@vapi-ai/web';
import { useState, useEffect, useRef, useCallback } from 'react';

import { useSubscription } from '@/hooks/useSubscription';
import {
  startVoiceSession,
  endVoiceSession,
  cancelVoiceSession,
} from '@/lib/actions/session.actions';
import { ASSISTANT_ID, DEFAULT_VOICE, VOICE_SETTINGS } from '@/lib/constants';
import { getVoice } from '@/lib/utils';
import type { IBook, Messages } from '@/types';

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
// Vapi's own cap is a backstop: it ends the call a little after our timer,
// so the friendly "time limit reached" message normally shows first
const VAPI_MAX_DURATION_GRACE_SECONDS = 10;

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
  const [messages, setMessages] = useState<Messages[]>([]);
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
            // Only skip an exact repeat of the previous message. Comparing with
            // the whole history would drop a second "yes" later in the chat.
            const last = prev[prev.length - 1];
            const isDupe =
              last?.role === message.role &&
              last?.content === message.transcript;

            return isDupe
              ? prev
              : [...prev, { role: message.role, content: message.transcript }];
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
        if (
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

    return () => {
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

      const firstMessage = `Hey, good to meet you. Quick question before we dive in - have you actually read ${book.title} yet, or are we starting fresh?`;

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
      setLimitError('Failed to start voice session. Please try again.');
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

  return {
    status,
    isActive,
    messages,
    currentMessage,
    currentUserMessage,
    duration,
    start,
    stop,
    limitError,
    isBillingError,
    maxDurationSeconds,
    clearError,
  };
}

export default useVapi;
