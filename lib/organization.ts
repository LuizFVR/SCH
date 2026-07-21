import { and, asc, eq, inArray } from "drizzle-orm";
import { sectors, serviceTypes, units, users, userSectorScopes, userUnitScopes } from "../db/schema";
import type { AuthenticatedUser } from "./auth";
import { getDatabase, isDemoMode } from "./database";

export type OrganizationUnit = {
  id: string;
  name: string;
  active: boolean;
  sectors: Array<{ id: string; name: string; serviceType: string | null }>;
};

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: AuthenticatedUser["role"];
  active: boolean;
  lastLoginAt: Date | null;
};

const demoUnits: OrganizationUnit[] = [
  { id: "demo-urgencia", name: "Unidade Urgência", active: true, sectors: [
    { id: "demo-fisio-urgencia", name: "Fisioterapia", serviceType: "Fisioterapia" },
    { id: "demo-recepcao-urgencia", name: "Recepção", serviceType: "Recepção" },
    { id: "demo-pronto-atendimento", name: "Pronto atendimento", serviceType: "Pronto atendimento" },
  ] },
  { id: "demo-cendor", name: "Unidade Cendor", active: true, sectors: [
    { id: "demo-fisio-cendor", name: "Fisioterapia", serviceType: "Fisioterapia" },
    { id: "demo-reabilitacao", name: "Reabilitação", serviceType: "Reabilitação" },
    { id: "demo-recepcao-cendor", name: "Recepção", serviceType: "Recepção" },
  ] },
];

const demoUsers: ManagedUser[] = [
  { id: "demo-admin", name: "Luiz Felipe", email: "luiz@hospital.local", role: "ADMIN", active: true, lastLoginAt: new Date() },
  { id: "demo-unit", name: "Ana Martins", email: "ana.martins@hospital.local", role: "UNIT_MANAGER", active: true, lastLoginAt: null },
  { id: "demo-sector", name: "Rafael Souza", email: "rafael.souza@hospital.local", role: "SECTOR_MANAGER", active: true, lastLoginAt: null },
];

export async function listOrganizationUnits(user: AuthenticatedUser): Promise<OrganizationUnit[]> {
  if (isDemoMode()) return demoUnits;

  let allowedUnitIds: string[] | undefined;
  let allowedSectorIds: string[] | undefined;

  if (user.role === "UNIT_MANAGER") {
    allowedUnitIds = (await getDatabase().select({ id: userUnitScopes.unitId }).from(userUnitScopes).where(eq(userUnitScopes.userId, user.id))).map((row) => row.id);
  } else if (user.role === "SECTOR_MANAGER" || user.role === "ANALYST") {
    allowedSectorIds = (await getDatabase().select({ id: userSectorScopes.sectorId }).from(userSectorScopes).where(eq(userSectorScopes.userId, user.id))).map((row) => row.id);
  }

  if (allowedUnitIds && allowedUnitIds.length === 0) return [];
  if (allowedSectorIds && allowedSectorIds.length === 0) return [];

  const filters = [eq(units.hospitalId, user.hospitalId)];
  if (allowedUnitIds) filters.push(inArray(units.id, allowedUnitIds));
  if (allowedSectorIds) filters.push(inArray(sectors.id, allowedSectorIds));

  const rows = await getDatabase()
    .select({ unitId: units.id, unitName: units.name, unitActive: units.active, sectorId: sectors.id, sectorName: sectors.name, serviceType: serviceTypes.name })
    .from(units)
    .leftJoin(sectors, eq(sectors.unitId, units.id))
    .leftJoin(serviceTypes, eq(sectors.serviceTypeId, serviceTypes.id))
    .where(and(...filters))
    .orderBy(asc(units.name), asc(sectors.name));

  const grouped = new Map<string, OrganizationUnit>();
  for (const row of rows) {
    const unit = grouped.get(row.unitId) ?? { id: row.unitId, name: row.unitName, active: row.unitActive, sectors: [] };
    if (row.sectorId && row.sectorName) unit.sectors.push({ id: row.sectorId, name: row.sectorName, serviceType: row.serviceType });
    grouped.set(row.unitId, unit);
  }
  return [...grouped.values()];
}

export async function listManagedUsers(user: AuthenticatedUser): Promise<ManagedUser[]> {
  if (isDemoMode()) return demoUsers;
  return getDatabase().select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, lastLoginAt: users.lastLoginAt }).from(users).where(eq(users.hospitalId, user.hospitalId)).orderBy(asc(users.name));
}
