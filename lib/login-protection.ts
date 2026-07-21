import { createHmac } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { loginAttempts } from "../db/schema";
import { getDatabase } from "./database";

const MAX_FAILURES = 5;
const BLOCK_MINUTES = 15;

function emailKey(email: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não foi configurado.");
  return createHmac("sha256", secret).update(email).digest("hex");
}

export async function isLoginBlocked(email: string) {
  const attempt = await getDatabase().select().from(loginAttempts).where(eq(loginAttempts.emailHash, emailKey(email))).limit(1);
  return Boolean(attempt[0]?.blockedUntil && attempt[0].blockedUntil > new Date());
}

export async function registerLoginFailure(email: string) {
  const key = emailKey(email);
  const existing = await getDatabase().select().from(loginAttempts).where(eq(loginAttempts.emailHash, key)).limit(1);
  const resetWindow = existing[0]?.lastAttemptAt && existing[0].lastAttemptAt < new Date(Date.now() - BLOCK_MINUTES * 60 * 1_000);
  const nextFailureCount = resetWindow ? 1 : (existing[0]?.failureCount ?? 0) + 1;
  const blockedUntil = nextFailureCount >= MAX_FAILURES ? new Date(Date.now() + BLOCK_MINUTES * 60 * 1_000) : null;

  await getDatabase().insert(loginAttempts).values({ emailHash: key, failureCount: nextFailureCount, blockedUntil, lastAttemptAt: new Date() }).onConflictDoUpdate({
    target: loginAttempts.emailHash,
    set: { failureCount: sql`excluded.failure_count`, blockedUntil: sql`excluded.blocked_until`, lastAttemptAt: sql`excluded.last_attempt_at` },
  });
}

export async function clearLoginFailures(email: string) {
  await getDatabase().delete(loginAttempts).where(eq(loginAttempts.emailHash, emailKey(email)));
}

export function normalizeEmail(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}
