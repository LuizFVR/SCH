import { and, desc, eq } from "drizzle-orm";
import { publicationTargets, publications, responses, sectors, surveys, surveyVersions, units } from "../db/schema";
import type { AuthenticatedUser } from "./auth";
import { getDatabase, isDemoMode } from "./database";

export type LifecycleSurveyListItem = {
  id: string;
  title: string;
  scope: string;
  status: "Ativa" | "Pausada" | "Rascunho" | "Encerrada";
  responses: number;
  updatedAt: Date;
  hasDraft: boolean;
};

const demoItems: LifecycleSurveyListItem[] = [
  { id: "demo-fisioterapia", title: "Experiência pós-atendimento", scope: "Fisioterapia · 2 setores", status: "Ativa", responses: 340, updatedAt: new Date(), hasDraft: false },
  { id: "demo-recepcao", title: "Atendimento da recepção", scope: "Urgência · Recepção", status: "Pausada", responses: 302, updatedAt: new Date(Date.now() - 86_400_000), hasDraft: false },
  { id: "demo-internacao", title: "Pesquisa geral de internação", scope: "Sem publicação", status: "Rascunho", responses: 0, updatedAt: new Date("2026-07-18T12:00:00-03:00"), hasDraft: true },
];

export async function listLifecycleSurveys(user: AuthenticatedUser): Promise<LifecycleSurveyListItem[]> {
  if (isDemoMode()) return demoItems;
  const filters = [eq(surveys.hospitalId, user.hospitalId)];
  if (user.role !== "ADMIN") filters.push(eq(surveys.createdById, user.id));

  const rows = await getDatabase()
    .select({
      surveyId: surveys.id,
      name: surveys.name,
      updatedAt: surveys.updatedAt,
      versionStatus: surveyVersions.status,
      publicationStatus: publications.status,
      sectorName: sectors.name,
      unitName: units.name,
      responseId: responses.id,
    })
    .from(surveys)
    .leftJoin(surveyVersions, eq(surveyVersions.surveyId, surveys.id))
    .leftJoin(publications, eq(publications.surveyVersionId, surveyVersions.id))
    .leftJoin(publicationTargets, eq(publicationTargets.publicationId, publications.id))
    .leftJoin(sectors, eq(sectors.id, publicationTargets.sectorId))
    .leftJoin(units, eq(units.id, sectors.unitId))
    .leftJoin(responses, eq(responses.publicationTargetId, publicationTargets.id))
    .where(and(...filters))
    .orderBy(desc(surveys.updatedAt));

  const grouped = new Map<string, {
    id: string;
    title: string;
    updatedAt: Date;
    publicationStatuses: Set<string>;
    scopes: Set<string>;
    currentScopes: Set<string>;
    responseIds: Set<string>;
    hasDraft: boolean;
  }>();
  for (const row of rows) {
    const current = grouped.get(row.surveyId) ?? { id: row.surveyId, title: row.name, updatedAt: row.updatedAt, publicationStatuses: new Set<string>(), scopes: new Set<string>(), currentScopes: new Set<string>(), responseIds: new Set<string>(), hasDraft: false };
    if (row.versionStatus === "DRAFT") current.hasDraft = true;
    if (row.publicationStatus) current.publicationStatuses.add(row.publicationStatus);
    if (row.sectorName && row.unitName) {
      const scope = `${row.sectorName} · ${row.unitName}`;
      current.scopes.add(scope);
      if (row.publicationStatus === "ACTIVE" || row.publicationStatus === "SCHEDULED") current.currentScopes.add(scope);
    }
    if (row.responseId) current.responseIds.add(row.responseId);
    grouped.set(row.surveyId, current);
  }

  return [...grouped.values()].map((survey) => {
    const status: LifecycleSurveyListItem["status"] = survey.publicationStatuses.has("ACTIVE") ? "Ativa" : survey.publicationStatuses.has("SCHEDULED") ? "Pausada" : survey.hasDraft ? "Rascunho" : "Encerrada";
    const scopes = survey.currentScopes.size > 0 ? survey.currentScopes : survey.scopes;
    return {
      id: survey.id,
      title: survey.title,
      scope: scopes.size === 0 ? "Sem publicação" : scopes.size === 1 ? [...scopes][0] : `${scopes.size} setores`,
      status,
      responses: survey.responseIds.size,
      updatedAt: survey.updatedAt,
      hasDraft: survey.hasDraft,
    };
  });
}
