import { and, desc, eq, gte, inArray } from "drizzle-orm";
import {
  alerts,
  answers as responseAnswers,
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
import { listOrganizationUnits, type OrganizationUnit } from "./organization";

export type AnalyticsFilters = {
  days?: number;
  sectorId?: string;
  surveyId?: string;
};

export type AnalyticsResult = {
  filters: { days: number; sectorId?: string; surveyId?: string };
  organizationUnits: OrganizationUnit[];
  surveyOptions: Array<{ id: string; name: string }>;
  metrics: {
    overallScore: number | null;
    scoreChange: number | null;
    totalResponses: number;
    responseTrendPercent: number | null;
    activeSurveys: number;
    activeSectors: number;
    openAlerts: number;
    newAlertsToday: number;
  };
  sectorScores: Array<{ sectorId: string; name: string; score: number; responses: number }>;
  dailyVolume: Array<{ label: string; count: number }>;
  scoreDistribution: Array<{ score: number; count: number; percentage: number }>;
  surveyResults: Array<{ id: string; name: string; responses: number; score: number | null }>;
  recentAlerts: Array<{ id: string; score: number | null; sectorName: string; unitName: string; reason: string; createdAt: Date }>;
  recentComments: Array<{ id: string; surveyName: string; sectorName: string; unitName: string; question: string; comment: string; submittedAt: Date }>;
  featuredSurvey: { id: string; name: string; responses: number; sectors: number } | null;
};

const dayInMilliseconds = 24 * 60 * 60 * 1_000;

function roundedAverage(values: number[]) {
  if (values.length === 0) return null;
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10;
}

function normalizeDays(value?: number) {
  return [7, 30, 90].includes(value ?? 30) ? value ?? 30 : 30;
}

function answerAsText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function demoAnalytics(organizationUnits: OrganizationUnit[], days: number): AnalyticsResult {
  return {
    filters: { days },
    organizationUnits,
    surveyOptions: [{ id: "demo-fisioterapia", name: "Experiência pós-atendimento" }],
    metrics: { overallScore: 4.6, scoreChange: 0.2, totalResponses: 1284, responseTrendPercent: 18, activeSurveys: 6, activeSectors: 12, openAlerts: 3, newAlertsToday: 2 },
    sectorScores: [
      { sectorId: "demo-fisio-cendor", name: "Fisioterapia · Unidade Cendor", score: 4.8, responses: 186 },
      { sectorId: "demo-fisio-urgencia", name: "Fisioterapia · Unidade Urgência", score: 4.3, responses: 154 },
      { sectorId: "demo-recepcao-urgencia", name: "Recepção · Unidade Urgência", score: 3.9, responses: 302 },
    ],
    dailyVolume: [54, 72, 61, 88, 76, 96, 82].map((count, index) => ({ label: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"][index], count })),
    scoreDistribution: [1, 2, 3, 4, 5].map((score) => ({ score, count: [32, 57, 141, 438, 616][score - 1], percentage: [2, 4, 11, 34, 49][score - 1] })),
    surveyResults: [{ id: "demo-fisioterapia", name: "Experiência pós-atendimento", responses: 340, score: 4.6 }],
    recentAlerts: [],
    recentComments: [],
    featuredSurvey: { id: "demo-fisioterapia", name: "Experiência pós-atendimento", responses: 340, sectors: 2 },
  };
}

export async function getAnalytics(user: AuthenticatedUser, requested: AnalyticsFilters = {}): Promise<AnalyticsResult> {
  const days = normalizeDays(requested.days);
  const organizationUnits = await listOrganizationUnits(user);
  if (isDemoMode()) return demoAnalytics(organizationUnits, days);

  const allSectorIds = organizationUnits.flatMap((unit) => unit.sectors.map((sector) => sector.id));
  const sectorId = requested.sectorId && allSectorIds.includes(requested.sectorId) ? requested.sectorId : undefined;
  const scopedSectorIds = sectorId ? [sectorId] : allSectorIds;
  if (scopedSectorIds.length === 0) {
    return {
      filters: { days, sectorId }, organizationUnits, surveyOptions: [],
      metrics: { overallScore: null, scoreChange: null, totalResponses: 0, responseTrendPercent: null, activeSurveys: 0, activeSectors: 0, openAlerts: 0, newAlertsToday: 0 },
      sectorScores: [], dailyVolume: [], scoreDistribution: [1, 2, 3, 4, 5].map((score) => ({ score, count: 0, percentage: 0 })), surveyResults: [], recentAlerts: [], recentComments: [], featuredSurvey: null,
    };
  }

  const database = getDatabase();
  const activeRows = await database
    .select({ surveyId: surveys.id, surveyName: surveys.name, sectorId: sectors.id })
    .from(publications)
    .innerJoin(surveyVersions, eq(surveyVersions.id, publications.surveyVersionId))
    .innerJoin(surveys, eq(surveys.id, surveyVersions.surveyId))
    .innerJoin(publicationTargets, eq(publicationTargets.publicationId, publications.id))
    .innerJoin(sectors, eq(sectors.id, publicationTargets.sectorId))
    .where(and(inArray(sectors.id, allSectorIds), eq(publications.status, "ACTIVE"), eq(publicationTargets.active, true)));

  const surveyOptionMap = new Map(activeRows.map((row) => [row.surveyId, { id: row.surveyId, name: row.surveyName }]));
  const surveyOptions = [...surveyOptionMap.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const surveyId = requested.surveyId && surveyOptionMap.has(requested.surveyId) ? requested.surveyId : undefined;

  const now = new Date();
  const currentStart = new Date(now.getTime() - days * dayInMilliseconds);
  const previousStart = new Date(currentStart.getTime() - days * dayInMilliseconds);
  const responseFilters = [inArray(sectors.id, scopedSectorIds), gte(responses.submittedAt, previousStart)];
  if (surveyId) responseFilters.push(eq(surveys.id, surveyId));

  const responseRows = await database
    .select({
      id: responses.id,
      score: responses.overallScore,
      submittedAt: responses.submittedAt,
      surveyId: surveys.id,
      surveyName: surveys.name,
      sectorId: sectors.id,
      sectorName: sectors.name,
      unitName: units.name,
    })
    .from(responses)
    .innerJoin(publicationTargets, eq(publicationTargets.id, responses.publicationTargetId))
    .innerJoin(publications, eq(publications.id, publicationTargets.publicationId))
    .innerJoin(surveyVersions, eq(surveyVersions.id, publications.surveyVersionId))
    .innerJoin(surveys, eq(surveys.id, surveyVersions.surveyId))
    .innerJoin(sectors, eq(sectors.id, publicationTargets.sectorId))
    .innerJoin(units, eq(units.id, sectors.unitId))
    .where(and(...responseFilters))
    .limit(100_000);

  const currentResponses = responseRows.filter((row) => row.submittedAt >= currentStart);
  const previousResponses = responseRows.filter((row) => row.submittedAt < currentStart);
  const currentScores = currentResponses.flatMap((row) => row.score === null ? [] : [row.score]);
  const previousScores = previousResponses.flatMap((row) => row.score === null ? [] : [row.score]);
  const overallScore = roundedAverage(currentScores);
  const previousScore = roundedAverage(previousScores);
  const responseTrendPercent = previousResponses.length > 0
    ? Math.round(((currentResponses.length - previousResponses.length) / previousResponses.length) * 100)
    : currentResponses.length > 0 ? 100 : null;

  const sectorMap = new Map<string, { sectorId: string; name: string; scores: number[]; responses: number }>();
  const surveyMap = new Map<string, { id: string; name: string; scores: number[]; responses: number }>();
  for (const response of currentResponses) {
    const sector = sectorMap.get(response.sectorId) ?? { sectorId: response.sectorId, name: `${response.sectorName} · ${response.unitName}`, scores: [], responses: 0 };
    sector.responses += 1;
    if (response.score !== null) sector.scores.push(response.score);
    sectorMap.set(response.sectorId, sector);

    const survey = surveyMap.get(response.surveyId) ?? { id: response.surveyId, name: response.surveyName, scores: [], responses: 0 };
    survey.responses += 1;
    if (response.score !== null) survey.scores.push(response.score);
    surveyMap.set(response.surveyId, survey);
  }

  const sectorScores = [...sectorMap.values()].map((sector) => ({ ...sector, score: roundedAverage(sector.scores) ?? 0 })).map(({ scores: _scores, ...sector }) => sector).sort((a, b) => b.score - a.score || b.responses - a.responses);
  const surveyResults = [...surveyMap.values()].map((survey) => ({ id: survey.id, name: survey.name, responses: survey.responses, score: roundedAverage(survey.scores) })).sort((a, b) => b.responses - a.responses);

  const bucketDays = days > 30 ? 7 : 1;
  const bucketCount = Math.ceil(days / bucketDays);
  const dateLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
  const dailyVolume = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = new Date(currentStart.getTime() + index * bucketDays * dayInMilliseconds);
    return { label: dateLabel.format(bucketStart), count: 0 };
  });
  for (const response of currentResponses) {
    const index = Math.min(bucketCount - 1, Math.max(0, Math.floor((response.submittedAt.getTime() - currentStart.getTime()) / (bucketDays * dayInMilliseconds))));
    dailyVolume[index].count += 1;
  }

  const scoreCounts = new Map<number, number>([1, 2, 3, 4, 5].map((score) => [score, 0]));
  for (const score of currentScores) scoreCounts.set(score, (scoreCounts.get(score) ?? 0) + 1);
  const scoreDistribution = [...scoreCounts].map(([score, count]) => ({ score, count, percentage: currentScores.length ? Math.round((count / currentScores.length) * 100) : 0 }));

  const alertFilters = [inArray(sectors.id, scopedSectorIds), inArray(alerts.status, ["NEW", "VIEWED"] as const)];
  if (surveyId) alertFilters.push(eq(surveys.id, surveyId));
  const alertRows = await database
    .select({ id: alerts.id, score: responses.overallScore, sectorName: sectors.name, unitName: units.name, reason: alerts.reason, createdAt: alerts.createdAt })
    .from(alerts)
    .innerJoin(responses, eq(responses.id, alerts.responseId))
    .innerJoin(publicationTargets, eq(publicationTargets.id, responses.publicationTargetId))
    .innerJoin(publications, eq(publications.id, publicationTargets.publicationId))
    .innerJoin(surveyVersions, eq(surveyVersions.id, publications.surveyVersionId))
    .innerJoin(surveys, eq(surveys.id, surveyVersions.surveyId))
    .innerJoin(sectors, eq(sectors.id, alerts.sectorId))
    .innerJoin(units, eq(units.id, sectors.unitId))
    .where(and(...alertFilters))
    .orderBy(desc(alerts.createdAt))
    .limit(20);

  const commentFilters = [inArray(sectors.id, scopedSectorIds), gte(responses.submittedAt, currentStart), inArray(surveyQuestions.type, ["SHORT_TEXT", "LONG_TEXT"] as const)];
  if (surveyId) commentFilters.push(eq(surveys.id, surveyId));
  const commentRows = await database
    .select({ id: responseAnswers.id, surveyName: surveys.name, sectorName: sectors.name, unitName: units.name, question: surveyQuestions.title, value: responseAnswers.value, submittedAt: responses.submittedAt })
    .from(responseAnswers)
    .innerJoin(responses, eq(responses.id, responseAnswers.responseId))
    .innerJoin(surveyQuestions, eq(surveyQuestions.id, responseAnswers.questionId))
    .innerJoin(publicationTargets, eq(publicationTargets.id, responses.publicationTargetId))
    .innerJoin(publications, eq(publications.id, publicationTargets.publicationId))
    .innerJoin(surveyVersions, eq(surveyVersions.id, publications.surveyVersionId))
    .innerJoin(surveys, eq(surveys.id, surveyVersions.surveyId))
    .innerJoin(sectors, eq(sectors.id, publicationTargets.sectorId))
    .innerJoin(units, eq(units.id, sectors.unitId))
    .where(and(...commentFilters))
    .orderBy(desc(responses.submittedAt))
    .limit(8);
  const recentComments = commentRows.map((comment) => ({ ...comment, comment: answerAsText(comment.value) })).filter((comment) => comment.comment).map(({ value: _value, ...comment }) => comment);

  const filteredActiveRows = activeRows.filter((row) => (!sectorId || row.sectorId === sectorId) && (!surveyId || row.surveyId === surveyId));
  const activeSurveyIds = new Set(filteredActiveRows.map((row) => row.surveyId));
  const activeSectorIds = new Set(filteredActiveRows.map((row) => row.sectorId));
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const featuredBase = surveyResults[0] ?? (filteredActiveRows[0] ? { id: filteredActiveRows[0].surveyId, name: filteredActiveRows[0].surveyName, responses: 0, score: null } : null);
  const featuredSurvey = featuredBase ? {
    id: featuredBase.id,
    name: featuredBase.name,
    responses: featuredBase.responses,
    sectors: new Set(filteredActiveRows.filter((row) => row.surveyId === featuredBase.id).map((row) => row.sectorId)).size,
  } : null;

  return {
    filters: { days, sectorId, surveyId },
    organizationUnits,
    surveyOptions,
    metrics: {
      overallScore,
      scoreChange: overallScore !== null && previousScore !== null ? Math.round((overallScore - previousScore) * 10) / 10 : null,
      totalResponses: currentResponses.length,
      responseTrendPercent,
      activeSurveys: activeSurveyIds.size,
      activeSectors: activeSectorIds.size,
      openAlerts: alertRows.length,
      newAlertsToday: alertRows.filter((alert) => alert.createdAt >= todayStart).length,
    },
    sectorScores,
    dailyVolume,
    scoreDistribution,
    surveyResults,
    recentAlerts: alertRows.slice(0, 5),
    recentComments,
    featuredSurvey,
  };
}
