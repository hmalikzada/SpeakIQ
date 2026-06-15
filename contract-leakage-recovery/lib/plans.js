/**
 * Subscription tiers. monthlyAudits is the billable unit (one analysis run,
 * single or bulk, counts as one). priceUsd is display-only — the real charge
 * is the Stripe Price referenced by STRIPE_PRICE_PRO / STRIPE_PRICE_BUSINESS.
 */
export const PLANS = {
  free: {
    key: 'free',
    label: 'Free',
    monthlyAudits: 5,
    bulk: false,
    priceUsd: 0,
    blurb: 'Kick the tires',
    features: ['5 audits per month', 'Single contract audits', 'PDF audit reports', 'Legal advisory'],
  },
  pro: {
    key: 'pro',
    label: 'Pro',
    monthlyAudits: 100,
    bulk: true,
    priceUsd: 49,
    blurb: 'For active reviewers',
    features: ['100 audits per month', 'Bulk multi-vendor upload', 'Everything in Free'],
  },
  business: {
    key: 'business',
    label: 'Business',
    monthlyAudits: Infinity,
    bulk: true,
    priceUsd: 199,
    blurb: 'For teams at scale',
    features: ['Unlimited audits', 'Bulk multi-vendor upload', 'Priority processing', 'Everything in Pro'],
  },
};

export function planFor(name) {
  return PLANS[name] || PLANS.free;
}

/** Serializable plan list for the pricing UI (Infinity → null). */
export function publicPlans() {
  return Object.values(PLANS).map((p) => ({
    key: p.key,
    label: p.label,
    monthlyAudits: p.monthlyAudits === Infinity ? null : p.monthlyAudits,
    bulk: p.bulk,
    priceUsd: p.priceUsd,
    blurb: p.blurb,
    features: p.features,
  }));
}
