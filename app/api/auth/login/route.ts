import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auditLogs, users } from "../../../../db/schema";
import { adminUrl } from "../../../../lib/admin-url";
import { createSession } from "../../../../lib/auth";
import { getDatabase, isDemoMode } from "../../../../lib/database";
import { clearLoginFailures, isLoginBlocked, normalizeEmail, registerLoginFailure } from "../../../../lib/login-protection";
import { consumePasswordVerificationCost, verifyPassword } from "../../../../lib/password";

export const runtime = "nodejs";

function loginRedirect(request: Request, error?: string) {
  const url = adminUrl("/login", request);
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  if (isDemoMode()) return NextResponse.redirect(adminUrl("/", request), 303);

  const formData = await request.formData();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";

  if (!email.includes("@") || email.length > 254 || password.length < 1 || password.length > 256) {
    return loginRedirect(request, "invalid");
  }

  try {
    if (await isLoginBlocked(email)) return loginRedirect(request, "blocked");

    const database = getDatabase();
    const matchingUsers = await database.select().from(users).where(and(eq(users.email, email), eq(users.active, true))).limit(1);
    const user = matchingUsers[0];
    const passwordValid = user ? await verifyPassword(password, user.passwordHash) : (await consumePasswordVerificationCost(password), false);

    if (!user || !passwordValid) {
      await registerLoginFailure(email);
      return loginRedirect(request, "invalid");
    }

    await clearLoginFailures(email);
    await database.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
    await database.insert(auditLogs).values({ hospitalId: user.hospitalId, actorId: user.id, action: "AUTH_LOGIN", entityType: "USER", entityId: user.id });
    await createSession(user.id, remember);

    return NextResponse.redirect(adminUrl("/", request), 303);
  } catch (error) {
    console.error("Falha ao autenticar o usuário.", error instanceof Error ? error.message : "Erro desconhecido");
    return loginRedirect(request, "unavailable");
  }
}
