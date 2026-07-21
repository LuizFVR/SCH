import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hospitals, sessions, users } from "../db/schema";
import { getDatabase, isDemoMode } from "./database";

export type UserRole = "ADMIN" | "UNIT_MANAGER" | "SECTOR_MANAGER" | "ANALYST";

export type AuthenticatedUser = {
  id: string;
  hospitalId: string;
  hospitalName: string;
  name: string;
  email: string;
  role: UserRole;
};

const DEMO_USER: AuthenticatedUser = {
  id: "00000000-0000-4000-8000-000000000001",
  hospitalId: "00000000-0000-4000-8000-000000000002",
  hospitalName: "Hospital principal",
  name: "Luiz Felipe",
  email: "luiz@hospital.local",
  role: "ADMIN",
};

function sessionCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-vp_session" : "vp_session";
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, remember: boolean) {
  const database = getDatabase();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + (remember ? 30 : 0.5) * 24 * 60 * 60 * 1_000);

  await database.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));
  await database.insert(sessions).values({ userId, tokenHash: hashSessionToken(token), expiresAt });

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

export const getCurrentUser = cache(async (): Promise<AuthenticatedUser | null> => {
  if (isDemoMode()) return DEMO_USER;

  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token) return null;

  const rows = await getDatabase()
    .select({
      id: users.id,
      hospitalId: users.hospitalId,
      hospitalName: hospitals.name,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(hospitals, eq(users.hospitalId, hospitals.id))
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, new Date()), eq(users.active, true)))
    .limit(1);

  return rows[0] ?? null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(allowedRoles: UserRole[]) {
  const user = await requireUser();
  if (!allowedRoles.includes(user.role)) redirect("/");
  return user;
}

export async function deleteSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName())?.value;
  try {
    if (token && !isDemoMode()) {
      await getDatabase().delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
    }
  } finally {
    cookieStore.delete(sessionCookieName());
  }
}
