/**
 * Drizzle schema — mirrors db/schema.sql. Used for type-aware queries.
 * Works on both node-postgres (prod) and PGlite (test) drivers.
 */
import { pgTable, text, timestamp, integer, numeric, jsonb, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  company: text('company'),
  plan: text('plan').notNull().default('free'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  subscriptionStatus: text('subscription_status'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index('sessions_user_id_idx').on(t.userId) })
);

export const audits = pgTable(
  'audits',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    vendor: text('vendor'),
    mode: text('mode').notNull().default('single'),
    annualImpact: numeric('annual_impact').notNull().default('0'),
    findingCount: integer('finding_count').notNull().default(0),
    result: jsonb('result').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userCreatedIdx: index('audits_user_created_idx').on(t.userId, t.createdAt) })
);
