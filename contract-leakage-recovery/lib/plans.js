/**
 * Subscription tiers. monthlyAudits is the billable unit (one analysis run,
 * single or bulk, counts as one). Phase 2 (Stripe) maps prices to these keys.
 */
export const PLANS = {
  free: { key: 'free', label: 'Free', monthlyAudits: 5, bulk: false },
  pro: { key: 'pro', label: 'Pro', monthlyAudits: 100, bulk: true },
  business: { key: 'business', label: 'Business', monthlyAudits: Infinity, bulk: true },
};

export function planFor(name) {
  return PLANS[name] || PLANS.free;
}
