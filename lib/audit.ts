import { and, asc, count, desc, eq, gte } from "drizzle-orm";
import { auditLogs, users } from "../db/schema";
import type { AuthenticatedUser, UserRole } from "./auth";
import { getDatabase, isDemoMode } from "./database";

const PAGE_SIZE = 25;
const ALLOWED_PERIODS = new Set([7, 30, 90, 365]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const AUDIT_ACTIONS = {
  AUTH_LOGIN: { label: "Acesso ao sistema", group: "Acesso", tone: "success" },
  USER_CREATED: { label: "Usuário cadastrado", group: "Usuários", tone: "success" },
  SURVEY_DRAFT_CREATED: { label: "Rascunho criado", group: "Pesquisas", tone: "neutral" },
  SURVEY_DRAFT_UPDATED: { label: "Rascunho atualizado", group: "Pesquisas", tone: "neutral" },
  SURVEY_PUBLISHED: { label: "Pesquisa publicada", group: "Pesquisas", tone: "success" },
  SURVEY_VERSION_CREATED: { label: "Nova versão criada", group: "Pesquisas", tone: "neutral" },
  SURVEY_VERSION_PUBLISHED: { label: "Nova versão publicada", group: "Pesquisas", tone: "success" },
  SURVEY_PAUSE: { label: "Pesquisa pausada", group: "Pesquisas", tone: "warning" },
  SURVEY_RESUME: { label: "Pesquisa retomada", group: "Pesquisas", tone: "success" },
  SURVEY_END: { label: "Pesquisa encerrada", group: "Pesquisas", tone: "warning" },
  RESPONSES_EXPORTED: { label: "Respostas exportadas", group: "Dados", tone: "warning" },
  RESPONSE_IDENTITY_VIEWED: { label: "Identificação visualizada", group: "Dados", tone: "critical" },
  ALERT_RESOLVED: { label: "Alerta resolvido", group: "Alertas", tone: "success" },
} as const;

type KnownAuditAction = keyof typeof AUDIT_ACTIONS;
type AuditTone = "success" | "warning" | "critical" | "neutral";

export type AuditEvent = {
  id: string;
  action: string;
  actionLabel: string;
  group: string;
  tone: AuditTone;
  actorName: string;
  actorEmail: string | null;
  entityType: string;
  entityId: string | null;
  entityHref: string | null;
  detail: string;
  createdAt: Date;
};

export type AuditResult = {
  items: AuditEvent[];
  userOptions: Array<{ id: string; name: string; role: UserRole }>;
  actionOptions: Array<{ value: string; label: string; group: string }>;
  filters: { days: number; action: string | null; actorId: string | null; page: number };
  pagination: { page: number; pageCount: number; total: number; pageSize: number };
  metrics: { total: number; identityViews: number; exports: number; logins: number };
};

function numericMetadata(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function describeEvent(action: string, metadata: Record<string, unknown> | null) {
  if (action === "AUTH_LOGIN") return "Sessão autenticada com sucesso.";
  if (action === "USER_CREATED") {
    const role = typeof metadata?.role === "string" ? metadata.role : null;
    const roleLabels: Record<string, string> = { ADMIN: "administrador", UNIT_MANAGER: "gerente de unidade", SECTOR_MANAGER: "gerente de setor", ANALYST: "analista" };
    return role ? `Novo acesso criado com o perfil ${roleLabels[role] ?? "informado"}.` : "Novo acesso criado para a equipe.";
  }
  if (action === "RESPONSES_EXPORTED") {
    const rows = numericMetadata(metadata, "rows");
    const days = numericMetadata(metadata, "days");
    return `${rows === null ? "Exportação concluída" : `${rows} linha${rows === 1 ? "" : "s"} exportada${rows === 1 ? "" : "s"}`}${days === null ? "." : ` no período de ${days} dias.`}`;
  }
  if (action === "RESPONSE_IDENTITY_VIEWED") return "Dados identificados revelados por um usuário autorizado.";
  if (action === "ALERT_RESOLVED") return "Alerta operacional marcado como resolvido.";
  if (action.startsWith("SURVEY_")) {
    const version = numericMetadata(metadata, "version");
    const questions = numericMetadata(metadata, "questionCount");
    const targets = numericMetadata(metadata, "targetCount");
    const details = [
      version === null ? null : `versão ${version}`,
      questions === null ? null : `${questions} pergunta${questions === 1 ? "" : "s"}`,
      targets === null ? null : `${targets} setor${targets === 1 ? "" : "es"}`,
    ].filter(Boolean);
    return details.length ? `Registro da pesquisa: ${details.join(" · ")}.` : "Ciclo de vida da pesquisa atualizado.";
  }
  return "Evento administrativo registrado pelo sistema.";
}

function eventPresentation(action: string) {
  const known = AUDIT_ACTIONS[action as KnownAuditAction];
  if (known) return known;
  return { label: action.toLowerCase().replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase()), group: "Sistema", tone: "neutral" as const };
}

function entityHref(action: string, entityId: string | null) {
  if (!entityId) return null;
  if (action.startsWith("SURVEY_")) return `/pesquisas/${entityId}`;
  if (action === "RESPONSE_IDENTITY_VIEWED") return `/respostas/${entityId}`;
  return null;
}

function demoAudit(): AuditResult {
  const now = Date.now();
  const userOptions = [{ id: "00000000-0000-4000-8000-000000000001", name: "Luiz Felipe", role: "ADMIN" as const }];
  const items: AuditEvent[] = [
    { id: "demo-audit-1", action: "RESPONSE_IDENTITY_VIEWED", actionLabel: "Identificação visualizada", group: "Dados", tone: "critical", actorName: "Luiz Felipe", actorEmail: "luiz@hospital.local", entityType: "response", entityId: null, entityHref: null, detail: "Dados identificados revelados por um usuário autorizado.", createdAt: new Date(now - 12 * 60_000) },
    { id: "demo-audit-2", action: "RESPONSES_EXPORTED", actionLabel: "Respostas exportadas", group: "Dados", tone: "warning", actorName: "Luiz Felipe", actorEmail: "luiz@hospital.local", entityType: "report", entityId: null, entityHref: null, detail: "128 linhas exportadas no período de 30 dias.", createdAt: new Date(now - 75 * 60_000) },
    { id: "demo-audit-3", action: "AUTH_LOGIN", actionLabel: "Acesso ao sistema", group: "Acesso", tone: "success", actorName: "Luiz Felipe", actorEmail: "luiz@hospital.local", entityType: "USER", entityId: null, entityHref: null, detail: "Sessão autenticada com sucesso.", createdAt: new Date(now - 3 * 60 * 60_000) },
  ];
  return { items, userOptions, actionOptions: actionOptions(), filters: { days: 30, action: null, actorId: null, page: 1 }, pagination: { page: 1, pageCount: 1, total: items.length, pageSize: PAGE_SIZE }, metrics: { total: items.length, identityViews: 1, exports: 1, logins: 1 } };
}

function actionOptions() {
  return Object.entries(AUDIT_ACTIONS)
    .map(([value, definition]) => ({ value, label: definition.label, group: definition.group }))
    .sort((left, right) => left.group.localeCompare(right.group, "pt-BR") || left.label.localeCompare(right.label, "pt-BR"));
}

export async function getAuditEvents(
  user: AuthenticatedUser,
  requested: { days?: number; action?: string; actorId?: string; page?: number },
): Promise<AuditResult> {
  if (isDemoMode()) return demoAudit();
  const days = requested.days && ALLOWED_PERIODS.has(requested.days) ? requested.days : 30;
  const options = actionOptions();
  const action = requested.action && options.some((option) => option.value === requested.action) ? requested.action : null;
  const database = getDatabase();
  const userOptions = await database
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.hospitalId, user.hospitalId))
    .orderBy(asc(users.name));
  const actorId = requested.actorId && UUID_PATTERN.test(requested.actorId) && userOptions.some((actor) => actor.id === requested.actorId)
    ? requested.actorId
    : null;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
  const periodFilters = [eq(auditLogs.hospitalId, user.hospitalId), gte(auditLogs.createdAt, cutoff)];
  const filters = [...periodFilters];
  if (action) filters.push(eq(auditLogs.action, action));
  if (actorId) filters.push(eq(auditLogs.actorId, actorId));

  const [totalRows, metricRows] = await Promise.all([
    database.select({ total: count() }).from(auditLogs).where(and(...filters)),
    database.select({ action: auditLogs.action, total: count() }).from(auditLogs).where(and(...periodFilters)).groupBy(auditLogs.action),
  ]);
  const total = Number(totalRows[0]?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requestedPage = Number.isInteger(requested.page) && (requested.page ?? 0) > 0 ? requested.page! : 1;
  const page = Math.min(requestedPage, pageCount);
  const rows = await database
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(and(...filters))
    .orderBy(desc(auditLogs.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const metricMap = new Map(metricRows.map((row) => [row.action, Number(row.total)]));

  return {
    items: rows.map((row) => {
      const presentation = eventPresentation(row.action);
      return {
        id: row.id,
        action: row.action,
        actionLabel: presentation.label,
        group: presentation.group,
        tone: presentation.tone,
        actorName: row.actorName ?? "Usuário removido",
        actorEmail: row.actorEmail,
        entityType: row.entityType,
        entityId: row.entityId,
        entityHref: entityHref(row.action, row.entityId),
        detail: describeEvent(row.action, row.metadata),
        createdAt: row.createdAt,
      };
    }),
    userOptions,
    actionOptions: options,
    filters: { days, action, actorId, page },
    pagination: { page, pageCount, total, pageSize: PAGE_SIZE },
    metrics: {
      total: [...metricMap.values()].reduce((sum, value) => sum + value, 0),
      identityViews: metricMap.get("RESPONSE_IDENTITY_VIEWED") ?? 0,
      exports: metricMap.get("RESPONSES_EXPORTED") ?? 0,
      logins: metricMap.get("AUTH_LOGIN") ?? 0,
    },
  };
}
