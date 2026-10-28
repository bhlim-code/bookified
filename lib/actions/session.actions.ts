'use server';

import { auth } from '@clerk/nextjs/server';
import mongoose from 'mongoose';
import { revalidatePath } from 'next/cache';

import Book from '@/database/models/book.model';
import VoiceSession from '@/database/models/voice-session.model';
import { connectToDatabase } from '@/database/mongoose';
import {
  PLAN_LIMITS,
  getCurrentBillingPeriodStart,
} from '@/lib/subscription-constants';
import { getUserPlan } from '@/lib/subscription.server';
import type { EndSessionResult, StartSessionResult } from '@/types';

export const startVoiceSession = async (
  clerkId: string,
  bookId: string
): Promise<StartSessionResult> => {
  try {
    // The user comes from the server session. A clerkId sent by the browser
    // is only accepted when it matches: otherwise anyone could pass a fresh
    // id to start sessions with a zero count and skip the monthly limit.
    const { userId } = await auth();

    if (!userId || userId !== clerkId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!mongoose.isValidObjectId(bookId)) {
      return { success: false, error: 'Invalid book.' };
    }

    await connectToDatabase();

    const bookExists = await Book.exists({ _id: bookId });

    if (!bookExists) {
      return { success: false, error: 'Book not found.' };
    }

    // Limits/Plan to see whether a session is allowed.
    const plan = await getUserPlan();
    const limits = PLAN_LIMITS[plan];
    const billingPeriodStart = getCurrentBillingPeriodStart();

    const sessionCount = await VoiceSession.countDocuments({
      clerkId: userId,
      billingPeriodStart,
    });

    if (sessionCount >= limits.maxSessionsPerMonth) {
      revalidatePath('/');

      return {
        success: false,
        error: `You have reached the monthly session limit for your ${plan} plan (${limits.maxSessionsPerMonth}). Please upgrade for more sessions.`,
        isBillingError: true,
      };
    }

    const session = await VoiceSession.create({
      clerkId: userId,
      bookId,
      startedAt: new Date(),
      billingPeriodStart,
      durationSeconds: 0,
    });

    return {
      success: true,
      sessionId: session._id.toString(),
      maxDurationMinutes: limits.maxDurationPerSession,
    };
  } catch (e) {
    console.error('Error starting voice session', e);
    return {
      success: false,
      error: 'Failed to start voice session. Please try again later.',
    };
  }
};

export const endVoiceSession = async (
  sessionId: string,
  durationSeconds: number
): Promise<EndSessionResult> => {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!mongoose.isValidObjectId(sessionId)) {
      return { success: false, error: 'Voice session not found.' };
    }

    await connectToDatabase();

    // Only the owner can end a session
    const session = await VoiceSession.findOne({
      _id: sessionId,
      clerkId: userId,
    });

    if (!session) return { success: false, error: 'Voice session not found.' };

    // Already ended: do nothing, so the duration cannot be rewritten later
    if (session.endedAt) return { success: true };

    // The duration is measured by the browser, so it cannot be trusted:
    // never accept more time than has really passed since the session started
    const elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - session.startedAt.getTime()) / 1000)
    );
    const reportedSeconds = Math.max(0, Math.floor(durationSeconds) || 0);

    session.endedAt = new Date();
    session.durationSeconds = Math.min(reportedSeconds, elapsedSeconds);
    await session.save();

    return { success: true };
  } catch (e) {
    console.error('Error ending voice session', e);
    return {
      success: false,
      error: 'Failed to end voice session. Please try again later.',
    };
  }
};
