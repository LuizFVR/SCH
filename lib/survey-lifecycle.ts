import { and, asc, desc, eq } from "drizzle-orm";
import {
  publicationTargets,
  publications,
  responses,
  sectors,
  surveyQuestions,
  surveys,
  surveyVersions,
  units,
} from "../db/schema";
import type { AuthenticatedUser } from "./auth";
import { getDatabase, isDemoMode } from "./database";
import type { SurveyIdentificationMode, SurveyQuestionType } from "./survey-types";

export type SurveyLifecycleStatus = "Rascunho" | "Ativa" | "Pausada" | "Encerrada";

export type SurveyLifecycleDetail = {
  id: string;
  name: string;
  description: string | null;
  status: SurveyLifecycleStatus;
  hasDraft: boolean;
  draftVersion: number | null;
  displayedVersion: number;
  identificationMode: SurveyIdentificationMode;
  identificationFields: string[];
  questions: Array<{
    id: string;
    sourceQuestionId: string | null;
    title: string;
    type: SurveyQuestionType;
    required: boolean;
    options: string[];
  }>;
  targets: Array<{
    id: string;
    token: string;
    sectorId: string;
    sectorName: string;
    unitName: string;
    responses: number;
    active: boolean;
  }>;
  alertThreshold: number;
  duplicateWindowHours: number;
};

export async function getSurveyLifecycleDetail(user: AuthenticatedUser, surveyId: string): Promise<SurveyLifecycleDetail | null> {
  if (isDemoMode()) return null;
  const ownershipFilters = [eq(surveys.id, surveyId), eq(surveys.hospitalId, user.hospitalId)];
  if (user.role !== "ADMIN") ownershipFilters.push(eq(surveys.createdById, user.id));

  const [survey] = await getDatabase()
    .select({ id: surveys.id, name: surveys.name, description: surveys.description })
    .from(surveys)
    .where(and(...ownershipFilters))
    .limit(1);
  if (!survey) return null;

  const versions = await getDatabase()
    .select({
      id: surveyVersions.id,
      version: surveyVersions.version,
      status: surveyVersions.status,
      identificationMode: surveyVersions.identificationMode,
      identificationFields: surveyVersions.identificationFields,
    })
    .from(surveyVersions)
    .where(eq(surveyVersions.surveyId, surveyId))
    .orderBy(desc(surveyVersions.version));
  if (versions.length === 0) return null;

  const draft = versions.find((version) => version.status === "DRAFT");
  const publicationRows = await getDatabase()
    .select({
      id: publications.id,
      versionId: surveyVersions.id,
      version: surveyVersions.version,
      status: publications.status,
      alertThreshold: publications.alertThreshold,
      duplicateWindowHours: publications.duplicateWindowHours,
    })
    .from(publications)
    .innerJoin(surveyVersions, eq(surveyVersions.id, publications.surveyVersionId))
    .where(eq(surveyVersions.surveyId, surveyId))
    .orderBy(desc(publications.createdAt));
  const currentPublication = publicationRows.find((publication) => publication.status === "ACTIVE")
    ?? publicationRows.find((publication) => publication.status === "SCHEDULED")
    ?? publicationRows[0];
  const displayedVersion = draft ?? versions.find((version) => version.id === currentPublication?.versionId) ?? versions[0];

  const questionRows = await getDatabase()
    .select({
      id: surveyQuestions.id,
      sourceQuestionId: surveyQuestions.sourceQuestionId,
      title: surveyQuestions.title,
      type: surveyQuestions.type,
      required: surveyQuestions.required,
      options: surveyQuestions.options,
    })
    .from(surveyQuestions)
    .where(eq(surveyQuestions.surveyVersionId, displayedVersion.id))
    .orderBy(asc(surveyQuestions.position));

  const targetRows = currentPublication ? await getDatabase()
    .select({
      id: publicationTargets.id,
      token: publicationTargets.publicToken,
      sectorId: sectors.id,
      sectorName: sectors.name,
      unitName: units.name,
      active: publicationTargets.active,
      responseId: responses.id,
    })
    .from(publicationTargets)
    .innerJoin(sectors, eq(sectors.id, publicationTargets.sectorId))
    .innerJoin(units, eq(units.id, sectors.unitId))
    .leftJoin(responses, eq(responses.publicationTargetId, publicationTargets.id))
    .where(eq(publicationTargets.publicationId, currentPublication.id))
    .orderBy(asc(units.name), asc(sectors.name)) : [];

  const groupedTargets = new Map<string, SurveyLifecycleDetail["targets"][number] & { responseIds: Set<string> }>();
  for (const row of targetRows) {
    const target = groupedTargets.get(row.id) ?? {
      id: row.id,
      token: row.token,
      sectorId: row.sectorId,
      sectorName: row.sectorName,
      unitName: row.unitName,
      responses: 0,
      active: row.active,
      responseIds: new Set<string>(),
    };
    if (row.responseId) target.responseIds.add(row.responseId);
    target.responses = target.responseIds.size;
    groupedTargets.set(row.id, target);
  }

  const status: SurveyLifecycleStatus = !currentPublication
    ? "Rascunho"
    : currentPublication.status === "ACTIVE"
      ? "Ativa"
      : currentPublication.status === "SCHEDULED"
        ? "Pausada"
        : "Encerrada";

  return {
    ...survey,
    status,
    hasDraft: Boolean(draft),
    draftVersion: draft?.version ?? null,
    displayedVersion: displayedVersion.version,
    identificationMode: displayedVersion.identificationMode,
    identificationFields: displayedVersion.identificationFields ?? [],
    questions: questionRows.map((question) => ({ ...question, options: question.options ?? [] })),
    targets: [...groupedTargets.values()].map((target) => ({
      id: target.id,
      token: target.token,
      sectorId: target.sectorId,
      sectorName: target.sectorName,
      unitName: target.unitName,
      responses: target.responses,
      active: target.active,
    })),
    alertThreshold: currentPublication?.alertThreshold ?? 2,
    duplicateWindowHours: currentPublication?.duplicateWindowHours ?? 12,
  };
}

export async function getQrTarget(token: string) {
  if (isDemoMode()) return null;
  const [target] = await getDatabase()
    .select({ sectorName: sectors.name, unitName: units.name })
    .from(publicationTargets)
    .innerJoin(publications, eq(publications.id, publicationTargets.publicationId))
    .innerJoin(sectors, eq(sectors.id, publicationTargets.sectorId))
    .innerJoin(units, eq(units.id, sectors.unitId))
    .where(and(eq(publicationTargets.publicToken, token), eq(publicationTargets.active, true)))
    .limit(1);
  return target ?? null;
}
