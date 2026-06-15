/**
 * Audit persistence and monthly usage counting (for plan limits).
 */
import { randomUUID } from 'crypto';
import { and, eq, gte, desc, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

export async function saveAudit(userId, { vendor, mode, summary, result }) {
  const [row] = await db
    .insert(schema.audits)
    .values({
      id: randomUUID(),
      userId,
      vendor: vendor || null,
      mode: mode || 'single',
      annualImpact: String(summary?.totalAnnualImpactUsd ?? 0),
      findingCount: summary?.findingCount ?? 0,
      result,
    })
    .returning();
  return row;
}

export async function listAudits(userId, limit = 50) {
  return db
    .select({
      id: schema.audits.id,
      vendor: schema.audits.vendor,
      mode: schema.audits.mode,
      annualImpact: schema.audits.annualImpact,
      findingCount: schema.audits.findingCount,
      createdAt: schema.audits.createdAt,
    })
    .from(schema.audits)
    .where(eq(schema.audits.userId, userId))
    .orderBy(desc(schema.audits.createdAt))
    .limit(limit);
}

export async function getAudit(userId, id) {
  const [row] = await db
    .select()
    .from(schema.audits)
    .where(and(eq(schema.audits.id, id), eq(schema.audits.userId, userId)));
  return row || null;
}

export async function auditsThisMonth(userId) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [{ count }] = await db
    .select({ count: sql`count(*)::int` })
    .from(schema.audits)
    .where(and(eq(schema.audits.userId, userId), gte(schema.audits.createdAt, start)));
  return Number(count) || 0;
}
