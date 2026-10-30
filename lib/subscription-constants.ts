export const PLANS = {
  FREE: 'free',
  STANDARD: 'standard',
  PRO: 'pro',
} as const;

export type PlanType = (typeof PLANS)[keyof typeof PLANS];

export interface PlanLimits {
  maxBooks: number;
  maxSessionsPerMonth: number; // Infinity = unlimited (never send it through JSON: it becomes null)
  maxDurationPerSession: number; // in minutes
  hasSessionHistory: boolean;
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  [PLANS.FREE]: {
    maxBooks: 3,
    maxSessionsPerMonth: 5,
    maxDurationPerSession: 5,
    hasSessionHistory: false,
  },
  [PLANS.STANDARD]: {
    maxBooks: 10,
    maxSessionsPerMonth: 100,
    maxDurationPerSession: 15,
    hasSessionHistory: true,
  },
  [PLANS.PRO]: {
    maxBooks: 100,
    maxSessionsPerMonth: Infinity,
    maxDurationPerSession: 60,
    hasSessionHistory: true,
  },
};

// Use this instead of comparing with Infinity when you show a limit in the UI
export const isUnlimited = (limit: number): boolean => !Number.isFinite(limit);

// First moment of the current calendar month, in UTC. UTC keeps the value the
// same on every machine: with local time, your WSL machine and the server
// would produce different dates, and sessions counted by this exact value
// would be split across two "months".
// Call it at request time (server actions, after await connection() in a
// page): with Cache Components, new Date() during prerendering is an error.
export const getCurrentBillingPeriodStart = (): Date => {
  const now = new Date();

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};
