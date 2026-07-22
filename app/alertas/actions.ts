"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { alerts, auditLogs } from "../../db/schema";
import { requireUser } from "../../lib/auth";
import { getDatabase, isDemoMode } from "../../lib/database";
import { getAllowedSectorIds } from "../../lib/surveys";

export async function resolveAlert(formData: FormData) {
  const user = await requireUser();
  if (isDemoMode()) return;
  const alertId = String(formData.get("alertId") ?? "");
  if (!alertId) return;

  const allowedSectorIds = await getAllowedSectorIds(user);
  if (allowedSectorIds.length === 0) return;

  const updated = await getDatabase().update(alerts).set({
    status: "RESOLVED",
    resolvedAt: new Date(),
    resolvedById: user.id,
  }).where(and(eq(alerts.id, alertId), inArray(alerts.sectorId, allowedSectorIds))).returning({ id: alerts.id });

  if (updated[0]) {
    await getDatabase().insert(auditLogs).values({
      hospitalId: user.hospitalId,
      actorId: user.id,
      action: "ALERT_RESOLVED",
      entityType: "alert",
      entityId: updated[0].id,
    });
  }
  revalidatePath("/alertas");
}
