import 'server-only';

import { auth } from '@clerk/nextjs/server';

import { PLANS, PLAN_LIMITS } from '@/lib/subscription-constants';
import type { PlanType } from '@/lib/subscription-constants';

// The values in PLANS must match the plan slugs in the Clerk dashboard
// (Billing -> Plans -> the plan's "Slug"), not the display names. A wrong slug
// makes has() return false and the user silently gets the free limits.
export const getUserPlan = async (): Promise<PlanType> => {
  const { has, userId } = await auth();

  if (!userId) return PLANS.FREE;

  // Check the highest plan first
  if (has({ plan: PLANS.PRO })) return PLANS.PRO;
  if (has({ plan: PLANS.STANDARD })) return PLANS.STANDARD;

  return PLANS.FREE;
};

export const getPlanLimits = async () => {
  const plan = await getUserPlan();
  return PLAN_LIMITS[plan];
};
