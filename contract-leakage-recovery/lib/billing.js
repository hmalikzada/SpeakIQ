/**
 * Stripe billing wiring. All of it is optional: with no STRIPE_SECRET_KEY the
 * app runs normally and billing endpoints report "not configured", so the
 * tool still works before Stripe is set up.
 */
import Stripe from 'stripe';

const KEY = process.env.STRIPE_SECRET_KEY;
export const stripe = KEY ? new Stripe(KEY) : null;
export const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// Plan key → Stripe Price ID (set these in the environment).
const PRICE_IDS = {
  pro: process.env.STRIPE_PRICE_PRO || '',
  business: process.env.STRIPE_PRICE_BUSINESS || '',
};

export function billingEnabled() {
  return Boolean(stripe);
}

export function priceIdForPlan(plan) {
  return PRICE_IDS[plan] || null;
}

export function planForPriceId(priceId) {
  return Object.keys(PRICE_IDS).find((k) => PRICE_IDS[k] && PRICE_IDS[k] === priceId) || null;
}
