/**
 * Email/password auth with server-side sessions.
 *
 * Passwords are bcrypt-hashed. The session cookie holds a random 256-bit
 * token; only its sha256 hash is stored, so a database leak can't be replayed.
 */
import { randomBytes, createHash, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { eq, lt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

export const SESSION_COOKIE = 'cg_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function hashPassword(pw) {
  return bcrypt.hash(pw, 12);
}

export async function createUser({ email, password, name, company }) {
  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(schema.users)
    .values({
      id: randomUUID(),
      email: normalizeEmail(email),
      passwordHash,
      name: name?.trim() || null,
      company: company?.trim() || null,
    })
    .returning();
  return user;
}

export async function findUserByEmail(email) {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, normalizeEmail(email)));
  return user || null;
}

export async function findUserById(id) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return user || null;
}

export async function findUserByStripeCustomer(customerId) {
  if (!customerId) return null;
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.stripeCustomerId, customerId));
  return user || null;
}

/** Patch billing-related fields (plan, stripe ids, status) on a user. */
export async function updateUser(userId, fields) {
  const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  if (Object.keys(clean).length === 0) return;
  await db.update(schema.users).set(clean).where(eq(schema.users.id, userId));
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/** Create a session row, returning the raw token to set in the cookie. */
export async function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(schema.sessions).values({ id: hashToken(token), userId, expiresAt });
  // Opportunistic cleanup so expired sessions don't accumulate forever.
  db.delete(schema.sessions)
    .where(lt(schema.sessions.expiresAt, new Date()))
    .catch(() => {});
  return { token, expiresAt };
}

export async function getSessionUser(token) {
  if (!token) return null;
  const id = hashToken(token);
  const [session] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, id));
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
    return null;
  }
  return findUserById(session.userId);
}

export async function destroySession(token) {
  if (!token) return;
  await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)));
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
    path: '/',
  };
}

/** Express middleware: attach req.user (or null) from the session cookie. */
export async function attachUser(req, res, next) {
  req.user = null;
  if (db) {
    try {
      req.user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
    } catch {
      req.user = null;
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' });
  next();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
