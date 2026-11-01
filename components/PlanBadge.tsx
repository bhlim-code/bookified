'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';

import { PLANS } from '@/lib/subscription-constants';

// Display only: the limits themselves are enforced on the server
// (getUserPlan in subscription.server.ts). The plan slugs in PLANS must match
// the plan slugs in the Clerk dashboard.
const PlanBadge = () => {
  const { has, isLoaded } = useAuth();

  if (!isLoaded || !has) return null;

  const label = has({ plan: PLANS.PRO })
    ? 'Pro'
    : has({ plan: PLANS.STANDARD })
      ? 'Standard'
      : 'Free';

  return (
    // h-8 matches the 32px Clerk avatar next to it, so the badge lines up
    // with the rest of the navbar instead of looking smaller
    <Link
      href='/subscriptions'
      className='inline-flex h-8 items-center rounded-full border border-[rgba(33,42,59,0.12)] px-3.5 text-sm leading-none font-medium text-[#212a3b] transition-colors hover:bg-[#212a3b]/10'
    >
      {label}
    </Link>
  );
};

export default PlanBadge;
