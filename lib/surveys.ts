import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import {
  alerts,
  hospitals,
  publicationTargets,
  publications,
  questionBank,
  responses,
  sectors,
  surveyQuestions,
  surveys,
  surveyVersions,
  units,
} from "../db/schema";
import type { AuthenticatedUser } from "./auth";
import { getDatabase, isDemoMode } from "./database";
import { listOrganizationUnits } from "./organization";
import type { PublicSurvey, SurveyQuestionType } from "./survey-types";

export type QuestionLibraryItem = {
  id: string;
  title: string;
  type: SurveyQuestionType;
  options: string[];
  category: string;
};

export type SurveyListItem = {
  id: string;
  title: string;
  scope: string;
  status: "Ativa" | "Rascunho" | "Encerrada";
  responses: number;
  updatedAt: Date;
};

export type SurveyDetail = {
  id: string;
  name: string;
  description: string | null;
  status: "Ativa" | "Rascunho" | "Encerrada";
  identificationMode: "ANONYMOUS" | "OPTIONAL" | "REQUIRED";
  questions: Array<{ id: string; title: string; type: SurveyQuestionType; required: boolean }>;
  targets: Array<{
    id: string;
    token: string;
    sectorName: string;
    unitName: string;
    responses: number;
  }>;
};

export type AlertListItem = {
  id: string;
  score: number | null;
  sectorId: string;
  sectorName: string;
  unitName: string;
  reason: string;
  status: "NEW" | "VIEWED" | "RESOLVED";
  createdAt: Date;
};

const demoLibrary: QuestionLibraryItem[] = [
  { id: "demo-library-wait", title: "Como você avalia o tempo de espera?", type: "STARS", options: [], category: "Atendimento" },
  { id: "demo-library-recommend", title: "Você recomendaria este atendimento?", type: "NPS", options: [], category: "Experiência" },
  { id: "demo-library-return", title: "Deseja receber um retorno do setor?", type: "YES_NO", options: [], category: "Contato" },
];

const demoSurveys: SurveyListItem[] = [
  { id: "demo-fisioterapia", title: "Experiência pós-atendimento", scope: "Fisioterapia · 2 setores", status: "Ativa", responses: 340, updatedAt: new Date() },
  { id: "demo-recepcao", title: "Atendimento da recepção", scope: "Urgência · Recepção", status: "Ativa", responses: 302, updatedAt: new Date(Date.now() - 86_400_000) },
  { id: "demo-internacao", title: "Pesquisa geral de internação", scope: "Sem publicação", status: "Rascunho", responses: 0, updatedAt: new Date("2026-07-18T12:00:00-03:00") },
];

const demoAlerts: AlertListItem[] = [
  { id: "demo-alert-1", score: 1, sectorId: "demo-recepcao-urgencia", sectorName: "Recepção", unitName: "Unidade Urgência", reason: "Avaliação geral de 1 estrela, abaixo do limite de 2.", status: "NEW", createdAt: new Date() },
  { id: "demo-alert-2", score: 2, sectorId: "demo-fisio-urgencia", sectorName: "Fisioterapia", unitName: "Unidade Urgência", reason: "Avaliação geral de 2 estrelas, abaixo do limite de 2.", status: "NEW", createdAt: new Date(Date.now() - 86_400_000) },
];

export async function getAllowedSectorIds(user: AuthenticatedUser) {
  const organizationUnits = await listOrganizationUnits(user);
  return organizationUnits.flatMap((unit) => unit.sectors.map((sector) => sector.id));
}

export async function listQuestionLibrary(user: AuthenticatedUser): Promise<QuestionLibraryItem[]> {
  if (isDemoMode()) return demoLibrary;

  const rows = await getDatabase()
    .select({ id: questionBank.id, title: questionBank.title, type: questionBank.type, options: questionBank.options, category: questionBank.category })
    .from(questionBank)
    .where(and(eq(questionBank.hospitalId, user.hospitalId), eq(questionBank.shared, true)))
    .orderBy(desc(questionBank.createdAt))
    .limit(30);

  return rows.map((row) => ({ ...row, options: row.options ?? [] }));
}

export async function listSurveys(user: AuthenticatedUser): Promise<SurveyListItem[]> {
  if (isDemoMode()) return demoSurveys;

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

  const grouped = new Map<string, { item: SurveyListItem; scopes: Set<string>; responseIds: Set<string> }>();
  for (const row of rows) {
    const current = grouped.get(row.surveyId) ?? {
      item: {
        id: row.surveyId,
        title: row.name,
        scope: "Sem publicação",
        status: row.versionStatus === "DRAFT" ? "Rascunho" : row.publicationStatus === "ENDED" ? "Encerrada" : "Ativa",
        responses: 0,
        updatedAt: row.updatedAt,
      },
      scopes: new Set<string>(),
      responseIds: new Set<string>(),
    };
    if (row.sectorName && row.unitName) current.scopes.add(`${row.sectorName} · ${row.unitName}`);
    if (row.responseId) current.responseIds.add(row.responseId);
    grouped.set(row.surveyId, current);
  }

  return [...grouped.values()].map(({ item, scopes, responseIds }) => ({
    ...item,
    scope: scopes.size === 0 ? "Sem publicação" : scopes.size === 1 ? [...scopes][0] : `${scopes.size} setores`,
    responses: responseIds.size,
  }));
}

export async function getSurveyDetail(user: AuthenticatedUser, surveyId: string): Promise<SurveyDetail | null> {
  if (isDemoMode()) return null;

  const filters = [eq(surveys.id, surveyId), eq(surveys.hospitalId, user.hospitalId)];
  if (user.role !== "ADMIN") filters.push(eq(surveys.createdById, user.id));

  const surveyRows = await getDatabase()
    .select({ id: surveys.id, name: surveys.name, description: surveys.description })
    .from(surveys)
    .where(and(...filters))
    .limit(1);
  const survey = surveyRows[0];
  if (!survey) return null;

  const versionRows = await getDatabase()
    .select({ id: surveyVersions.id, status: surveyVersions.status, identificationMode: surveyVersions.identificationMode })
    .from(surveyVersions)
    .where(eq(surveyVersions.surveyId, surveyId))
    .orderBy(desc(surveyVersions.version))
    .limit(1);
  const version = versionRows[0];
  if (!version) return null;

  const questionRows = await getDatabase()
    .select({ id: surveyQuestions.id, title: surveyQuestions.title, type: surveyQuestions.type, required: surveyQuestions.required })
    .from(surveyQuestions)
    .where(eq(surveyQuestions.surveyVersionId, version.id))
    .orderBy(asc(surveyQuestions.position));

  const targetRows = await getDatabase()
    .select({ id: publicationTargets.id, token: publicationTargets.publicToken, sectorName: sectors.name, unitName: units.name, responseId: responses.id, publicationStatus: publications.status })
    .from(publications)
    .innerJoin(publicationTargets, eq(publicationTargets.publicationId, publications.id))
    .innerJoin(sectors, eq(sectors.id, publicationTargets.sectorId))
    .innerJoin(units, eq(units.id, sectors.unitId))
    .leftJoin(responses, eq(responses.publicationTargetId, publicationTargets.id))
    .where(eq(publications.surveyVersionId, version.id))
    .orderBy(asc(units.name), asc(sectors.name));

  const groupedTargets = new Map<string, SurveyDetail["targets"][number] & { responseIds: Set<string> }>();
  for (const row of targetRows) {
    const current = groupedTargets.get(row.id) ?? { id: row.id, token: row.token, sectorName: row.sectorName, unitName: row.unitName, responses: 0, responseIds: new Set<string>() };
    if (row.responseId) current.responseIds.add(row.responseId);
    current.responses = current.responseIds.size;
    groupedTargets.set(row.id, current);
  }

  const firstPublicationStatus = targetRows[0]?.publicationStatus;
  return {
    ...survey,
    status: version.status === "DRAFT" ? "Rascunho" : firstPublicationStatus === "ENDED" ? "Encerrada" : "Ativa",
    identificationMode: version.identificationMode,
    questions: questionRows,
    targets: [...groupedTargets.values()].map((target) => ({ id: target.id, token: target.token, sectorName: target.sectorName, unitName: target.unitName, responses: target.responses })),
  };
}

export async function getPublicSurvey(token: string): Promise<PublicSurvey | null> {
  if (isDemoMode()) return null;
  const now = new Date();

  const rows = await getDatabase()
    .select({
      token: publicationTargets.publicToken,
      hospitalName: hospitals.name,
      surveyName: surveys.name,
      description: surveys.description,
      unitName: units.name,
      sectorName: sectors.name,
      identificationMode: surveyVersions.identificationMode,
      identificationFields: surveyVersions.identificationFields,
      consentText: surveyVersions.consentText,
      versionId: surveyVersions.id,
    })
    .from(publicationTargets)
    .innerJoin(publications, eq(publications.id, publicationTargets.publicationId))
    .innerJoin(surveyVersions, eq(surveyVersions.id, publications.surveyVersionId))
    .innerJoin(surveys, eq(surveys.id, surveyVersions.surveyId))
    .innerJoin(hospitals, eq(hospitals.id, surveys.hospitalId))
    .innerJoin(sectors, eq(sectors.id, publicationTargets.sectorId))
    .innerJoin(units, eq(units.id, sectors.unitId))
    .where(and(
      eq(publicationTargets.publicToken, token),
      eq(publicationTargets.active, true),
      eq(publications.status, "ACTIVE"),
      or(isNull(publications.startsAt), lte(publications.startsAt, now)),
      or(isNull(publications.endsAt), gte(publications.endsAt, now)),
    ))
    .limit(1);

  const survey = rows[0];
  if (!survey) return null;

  const questions = await getDatabase()
    .select({ id: surveyQuestions.id, title: surveyQuestions.title, type: surveyQuestions.type, required: surveyQuestions.required, options: surveyQuestions.options })
    .from(surveyQuestions)
    .where(eq(surveyQuestions.surveyVersionId, survey.versionId))
    .orderBy(asc(surveyQuestions.position));

  return {
    token: survey.token,
    hospitalName: survey.hospitalName,
    surveyName: survey.surveyName,
    description: survey.description,
    unitName: survey.unitName,
    sectorName: survey.sectorName,
    identificationMode: survey.identificationMode,
    identificationFields: survey.identificationFields ?? [],
    consentText: survey.consentText,
    questions: questions.map((question) => ({ ...question, options: question.options ?? [] })),
  };
}

export async function listAlerts(user: AuthenticatedUser): Promise<AlertListItem[]> {
  if (isDemoMode()) return demoAlerts;
  const allowedSectorIds = await getAllowedSectorIds(user);
  if (allowedSectorIds.length === 0) return [];

  return getDatabase()
    .select({
      id: alerts.id,
      score: responses.overallScore,
      sectorId: sectors.id,
      sectorName: sectors.name,
      unitName: units.name,
      reason: alerts.reason,
      status: alerts.status,
      createdAt: alerts.createdAt,
    })
    .from(alerts)
    .innerJoin(responses, eq(responses.id, alerts.responseId))
    .innerJoin(sectors, eq(sectors.id, alerts.sectorId))
    .innerJoin(units, eq(units.id, sectors.unitId))
    .where(and(inArray(alerts.sectorId, allowedSectorIds), inArray(alerts.status, ["NEW", "VIEWED"])))
    .orderBy(desc(alerts.createdAt))
    .limit(100);
}
