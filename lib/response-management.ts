import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import {
  alerts,
  answers,
  auditLogs,
  publicationTargets,
  publications,
  responseIdentities,
  responses,
  sectors,
  surveyQuestions,
  surveys,
  surveyVersions,
  units,
} from "../db/schema";
import type { AuthenticatedUser } from "./auth";
import { getDatabase, isDemoMode } from "./database";
import { decryptIdentityValue } from "./identity-crypto";
import { listOrganizationUnits, type OrganizationUnit } from "./organization";
import { getAllowedSectorIds } from "./surveys";
import type { SurveyQuestionType } from "./survey-types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_PERIODS = new Set([7, 30, 90]);

export type ManagedResponseListItem = {
  id: string;
  surveyId: string;
  surveyName: string;
  unitName: string;
  sectorId: string;
  sectorName: string;
  score: number | null;
  identified: boolean;
  submittedAt: Date;
};

export type ManagedResponseList = {
  items: ManagedResponseListItem[];
  organizationUnits: OrganizationUnit[];
  surveyOptions: Array<{ id: string; name: string }>;
  filters: { days: number; sectorId: string | null; surveyId: string | null };
};

export type ManagedResponseDetail = ManagedResponseListItem & {
  identificationMode: "ANONYMOUS" | "OPTIONAL" | "REQUIRED";
  answers: Array<{
    id: string;
    question: string;
    type: SurveyQuestionType;
    value: unknown;
    position: number;
  }>;
  identityAvailable: boolean;
  canRevealIdentity: boolean;
  identity: null | {
    name: string | null;
    contact: string | null;
    age: string | null;
    sex: string | null;
    consentAt: Date;
  };
  identityError: string | null;
};

export type OperationalAlert = {
  id: string;
  responseId: string;
  score: number | null;
  sectorName: string;
  unitName: string;
  reason: string;
  createdAt: Date;
};

export async function listManagedResponses(
  user: AuthenticatedUser,
  requested: { days?: number; sectorId?: string; surveyId?: string },
): Promise<ManagedResponseList> {
  const organizationUnits = await listOrganizationUnits(user);
  const allowedSectorIds = organizationUnits.flatMap((unit) => unit.sectors.map((sector) => sector.id));
  const days = requested.days && ALLOWED_PERIODS.has(requested.days) ? requested.days : 30;
  const sectorId = requested.sectorId && allowedSectorIds.includes(requested.sectorId) ? requested.sectorId : null;

  if (isDemoMode() || allowedSectorIds.length === 0) {
    return { items: [], organizationUnits, surveyOptions: [], filters: { days, sectorId, surveyId: null } };
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const baseFilters = [
    eq(surveys.hospitalId, user.hospitalId),
    inArray(sectors.id, allowedSectorIds),
    gte(responses.submittedAt, cutoff),
  ];
  const database = getDatabase();
  const surveyOptions = await database
    .selectDistinct({ id: surveys.id, name: surveys.name })
    .from(responses)
    .innerJoin(publicationTargets, eq(publicationTargets.id, responses.publicationTargetId))
    .innerJoin(sectors, eq(sectors.id, publicationTargets.sectorId))
    .innerJoin(publications, eq(publications.id, publicationTargets.publicationId))
    .innerJoin(surveyVersions, eq(surveyVersions.id, publications.surveyVersionId))
    .innerJoin(surveys, eq(surveys.id, surveyVersions.surveyId))
    .where(and(...baseFilters))
    .orderBy(asc(surveys.name));
  const surveyId = requested.surveyId && surveyOptions.some((survey) => survey.id === requested.surveyId)
    ? requested.surveyId
    : null;
  const responseFilters = [...baseFilters];
  if (sectorId) responseFilters.push(eq(sectors.id, sectorId));
  if (surveyId) responseFilters.push(eq(surveys.id, surveyId));

  const items = await database
    .select({
      id: responses.id,
      surveyId: surveys.id,
      surveyName: surveys.name,
      unitName: units.name,
      sectorId: sectors.id,
      sectorName: sectors.name,
      score: responses.overallScore,
      identified: responses.identified,
      submittedAt: responses.submittedAt,
    })
    .from(responses)
    .innerJoin(publicationTargets, eq(publicationTargets.id, responses.publicationTargetId))
    .innerJoin(sectors, eq(sectors.id, publicationTargets.sectorId))
    .innerJoin(units, eq(units.id, sectors.unitId))
    .innerJoin(publications, eq(publications.id, publicationTargets.publicationId))
    .innerJoin(surveyVersions, eq(surveyVersions.id, publications.surveyVersionId))
    .innerJoin(surveys, eq(surveys.id, surveyVersions.surveyId))
    .where(and(...responseFilters))
    .orderBy(desc(responses.submittedAt))
    .limit(200);

  return {
    items,
    organizationUnits,
    surveyOptions,
    filters: { days, sectorId, surveyId },
  };
}

export async function getManagedResponse(
  user: AuthenticatedUser,
  responseId: string,
  revealIdentity: boolean,
): Promise<ManagedResponseDetail | null> {
  if (isDemoMode() || !UUID_PATTERN.test(responseId)) return null;
  const allowedSectorIds = await getAllowedSectorIds(user);
  if (allowedSectorIds.length === 0) return null;

  const rows = await getDatabase()
    .select({
      id: responses.id,
      surveyId: surveys.id,
      surveyName: surveys.name,
      unitName: units.name,
      sectorId: sectors.id,
      sectorName: sectors.name,
      score: responses.overallScore,
      identified: responses.identified,
      submittedAt: responses.submittedAt,
      identificationMode: surveyVersions.identificationMode,
    })
    .from(responses)
    .innerJoin(publicationTargets, eq(publicationTargets.id, responses.publicationTargetId))
    .innerJoin(sectors, eq(sectors.id, publicationTargets.sectorId))
    .innerJoin(units, eq(units.id, sectors.unitId))
    .innerJoin(publications, eq(publications.id, publicationTargets.publicationId))
    .innerJoin(surveyVersions, eq(surveyVersions.id, publications.surveyVersionId))
    .innerJoin(surveys, eq(surveys.id, surveyVersions.surveyId))
    .where(and(
      eq(responses.id, responseId),
      eq(surveys.hospitalId, user.hospitalId),
      inArray(sectors.id, allowedSectorIds),
    ))
    .limit(1);
  const response = rows[0];
  if (!response) return null;

  const answerRows = await getDatabase()
    .select({
      id: answers.id,
      question: surveyQuestions.title,
      type: surveyQuestions.type,
      value: answers.value,
      position: surveyQuestions.position,
    })
    .from(answers)
    .innerJoin(surveyQuestions, eq(surveyQuestions.id, answers.questionId))
    .where(eq(answers.responseId, responseId))
    .orderBy(asc(surveyQuestions.position));

  const identityRows = response.identified
    ? await getDatabase().select().from(responseIdentities).where(eq(responseIdentities.responseId, responseId)).limit(1)
    : [];
  const encryptedIdentity = identityRows[0];
  const canRevealIdentity = user.role !== "ANALYST";
  let identity: ManagedResponseDetail["identity"] = null;
  let identityError: string | null = null;

  if (revealIdentity && encryptedIdentity && canRevealIdentity) {
    const secret = process.env.IDENTITY_ENCRYPTION_KEY;
    if (!secret) {
      identityError = "A chave de identificação não está configurada no servidor.";
    } else {
      try {
        const demographics = encryptedIdentity.demographicsCiphertext
          ? JSON.parse(decryptIdentityValue(encryptedIdentity.demographicsCiphertext, secret)) as { age?: string; sex?: string }
          : {};
        identity = {
          name: encryptedIdentity.nameCiphertext ? decryptIdentityValue(encryptedIdentity.nameCiphertext, secret) : null,
          contact: encryptedIdentity.contactCiphertext ? decryptIdentityValue(encryptedIdentity.contactCiphertext, secret) : null,
          age: demographics.age ?? null,
          sex: demographics.sex ?? null,
          consentAt: encryptedIdentity.consentAt,
        };
        await getDatabase().insert(auditLogs).values({
          hospitalId: user.hospitalId,
          actorId: user.id,
          action: "RESPONSE_IDENTITY_VIEWED",
          entityType: "response",
          entityId: responseId,
          metadata: { sectorId: response.sectorId },
        });
      } catch {
        identityError = "Não foi possível descriptografar a identificação desta resposta.";
      }
    }
  }

  return {
    ...response,
    answers: answerRows,
    identityAvailable: Boolean(encryptedIdentity),
    canRevealIdentity,
    identity,
    identityError,
  };
}

export async function listOperationalAlerts(user: AuthenticatedUser): Promise<OperationalAlert[]> {
  if (isDemoMode()) return [];
  const allowedSectorIds = await getAllowedSectorIds(user);
  if (allowedSectorIds.length === 0) return [];

  return getDatabase()
    .select({
      id: alerts.id,
      responseId: alerts.responseId,
      score: responses.overallScore,
      sectorName: sectors.name,
      unitName: units.name,
      reason: alerts.reason,
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
