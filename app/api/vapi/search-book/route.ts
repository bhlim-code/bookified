import { timingSafeEqual } from 'node:crypto';

import mongoose from 'mongoose';
import { NextResponse } from 'next/server';

import { searchBookSegments } from '@/lib/actions/book.actions';

const MAX_QUERY_LENGTH = 200;
const MAX_TOOL_CALLS = 5;

// Vapi sends the shared secret in a header (set it in the tool's server
// settings). Without it anyone could read any book by posting its id.
function isAuthorized(request: Request) {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  const received = request.headers.get('x-vapi-secret');
  if (!secret || !received) return false;

  const a = Buffer.from(secret);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Parse tool arguments that may arrive as a JSON string or an object
function parseArgs(args: unknown): Record<string, unknown> {
  if (!args) return {};
  if (typeof args === 'string') {
    try {
      const parsed: unknown = JSON.parse(args);
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return typeof args === 'object' ? (args as Record<string, unknown>) : {};
}

// Helper function to process book search logic
async function processBookSearch(bookId: unknown, query: unknown) {
  if (
    typeof bookId !== 'string' ||
    !mongoose.isValidObjectId(bookId) ||
    typeof query !== 'string'
  ) {
    return { result: 'Missing bookId or query' };
  }

  // Trim the query and cap its length so one request can't trigger a huge
  // regex search. An empty or whitespace-only query is treated as missing.
  const queryStr = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!queryStr) {
    return { result: 'Missing bookId or query' };
  }

  // Execute search
  const searchResult = await searchBookSegments(bookId, queryStr, 3);

  // Return results
  if (!searchResult.success || !searchResult.data?.length) {
    return { result: 'No information found about this topic in the book.' };
  }

  const combinedText = searchResult.data
    .map((segment) => segment.content)
    .join('\n\n');

  return { result: combinedText };
}

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (process.env.NODE_ENV === 'development') {
      console.warn('Vapi search-book:', body?.message?.type);
    }

    // Support multiple Vapi formats
    const functionCall = body?.message?.functionCall;
    const toolCallList: unknown =
      body?.message?.toolCallList || body?.message?.toolCalls;

    // Handle single functionCall format
    if (functionCall) {
      const { name, parameters } = functionCall;
      const parsed = parseArgs(parameters);

      if (name === 'searchBook') {
        const result = await processBookSearch(parsed.bookId, parsed.query);
        return NextResponse.json(result);
      }

      return NextResponse.json({ result: `Unknown function: ${name}` });
    }

    // Handle toolCallList format (array of calls)
    if (!Array.isArray(toolCallList) || toolCallList.length === 0) {
      return NextResponse.json({
        results: [{ result: 'No tool calls found' }],
      });
    }

    const results = [];

    for (const toolCall of toolCallList.slice(0, MAX_TOOL_CALLS)) {
      const { id, function: func } = toolCall;
      const name = func?.name;
      const args = parseArgs(func?.arguments);

      if (name === 'searchBook') {
        const searchResult = await processBookSearch(args.bookId, args.query);
        results.push({ toolCallId: id, ...searchResult });
      } else {
        results.push({ toolCallId: id, result: `Unknown function: ${name}` });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Vapi search-book error:', error);
    return NextResponse.json({
      results: [{ result: 'Error processing request' }],
    });
  }
}
