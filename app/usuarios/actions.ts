"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditLogs, sectors, units, users, userSectorScopes, userUnitScopes } from "../../db/schema";
import { requireRole, type UserRole } from "../../lib/auth";
import { getDatabase } from "../../lib/database";
import { normalizeEmail } from "../../lib/login-protection";
import { hashPassword } from "../../lib/password";

const allowedRoles: UserRole[] = ["ADMIN", "UNIT_MANAGER", "SECTOR_MANAGER", "ANALYST"];

export async function createUserAction(formData: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const name = String(formData.get("name") ?? "").trim();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const passwordConfirmation = String(formData.get("passwordConfirmation") ?? "");
  const role = String(formData.get("role") ?? "") as UserRole;
  const unitId = String(formData.get("unitId") ?? "");
  const sectorId = String(formData.get("sectorId") ?? "");

  if (name.length < 3 || name.length > 160 || !email.includes("@") || email.length > 254 || !allowedRoles.includes(role) || password.length < 12 || password !== passwordConfirmation) {
    redirect("/usuarios/novo?error=invalid");
  }
  if (role === "UNIT_MANAGER" && !unitId) redirect("/usuarios/novo?error=scope");
  if ((role === "SECTOR_MANAGER" || role === "ANALYST") && !sectorId) redirect("/usuarios/novo?error=scope");

  if (role === "UNIT_MANAGER") {
    const allowedUnit = await getDatabase().select({ id: units.id }).from(units).where(and(eq(units.id, unitId), eq(units.hospitalId, actor.hospitalId))).limit(1);
    if (!allowedUnit[0]) redirect("/usuarios/novo?error=scope");
  }
  if (role === "SECTOR_MANAGER" || role === "ANALYST") {
    const allowedSector = await getDatabase().select({ id: sectors.id }).from(sectors).innerJoin(units, eq(sectors.unitId, units.id)).where(and(eq(sectors.id, sectorId), eq(units.hospitalId, actor.hospitalId))).limit(1);
    if (!allowedSector[0]) redirect("/usuarios/novo?error=scope");
  }

  const passwordHash = await hashPassword(password);
  try {
    await getDatabase().transaction(async (transaction) => {
      const inserted = await transaction.insert(users).values({ hospitalId: actor.hospitalId, name, email, passwordHash, role }).returning({ id: users.id });
      const newUserId = inserted[0]?.id;
      if (!newUserId) throw new Error("O usuário não foi criado.");
      if (role === "UNIT_MANAGER" && unitId) await transaction.insert(userUnitScopes).values({ userId: newUserId, unitId });
      if ((role === "SECTOR_MANAGER" || role === "ANALYST") && sectorId) await transaction.insert(userSectorScopes).values({ userId: newUserId, sectorId });
      await transaction.insert(auditLogs).values({ hospitalId: actor.hospitalId, actorId: actor.id, action: "USER_CREATED", entityType: "USER", entityId: newUserId, metadata: { role } });
    });
  } catch (error) {
    const databaseError = error as { code?: string };
    redirect(databaseError.code === "23505" ? "/usuarios/novo?error=exists" : "/usuarios/novo?error=save");
  }

  revalidatePath("/usuarios");
  redirect("/usuarios?created=1");
}
