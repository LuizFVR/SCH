import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  auditLogs,
  publicationTargets,
  publications,
  questionBank,
  surveyQuestions,
  surveys,
  surveyVersions,
} from "../../../../db/schema";
import { getCurrentUser } from "../../../../lib/auth";
import { getDatabase, isDemoMode } from "../../../../lib/database";
import { getAllowedSectorIds } from "../../../../lib/surveys";
import { QUESTION_TYPES, type SurveyIdentificationMode, type SurveyQuestionInput } from "../../../../lib/survey-types";

export const runtime = "nodejs";

type EditSurveyInput = {
  name: string;
  description?: string;
  questions: SurveyQuestionInput[];
  sectorIds: string[];
  identificationMode: SurveyIdentificationMode;
  identificationFields: string[];
  alertThreshold: number;
  duplicateWindowHours: number;
  intent: "save" | "publish";
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedIdentificationFields = new Set(["name", "contact", "age", "sex"]);

function cleanText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function parseInput(value: unknown): EditSurveyInput {
  if (!value || typeof value !== "object") throw new Error("Dados da pesquisa inválidos.");
  const record = value as Record<string, unknown>;
  const name = cleanText(record.name, 200);
  if (name.length < 3) throw new Error("Informe um nome para a pesquisa.");
  if (!Array.isArray(record.questions) || record.questions.length === 0 || record.questions.length > 50) throw new Error("A pesquisa deve ter entre 1 e 50 perguntas.");

  const questions = record.questions.map((value, index): SurveyQuestionInput => {
    if (!value || typeof value !== "object") throw new Error(`A pergunta ${index + 1} é inválida.`);
    const question = value as Record<string, unknown>;
    const title = cleanText(question.title, 500);
    if (title.length < 3) throw new Error(`Informe o texto da pergunta ${index + 1}.`);
    if (typeof question.type !== "string" || !QUESTION_TYPES.includes(question.type as SurveyQuestionInput["type"])) throw new Error(`O tipo da pergunta ${index + 1} é inválido.`);
    const type = question.type as SurveyQuestionInput["type"];
    const options = Array.isArray(question.options) ? [...new Set(question.options.map((option) => cleanText(option, 120)).filter(Boolean))].slice(0, 15) : [];
    if ((type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE") && options.length < 2) throw new Error(`Adicione pelo menos duas opções à pergunta ${index + 1}.`);
    const sourceQuestionId = cleanText(question.sourceQuestionId, 80) || undefined;
    if (sourceQuestionId && !uuidPattern.test(sourceQuestionId)) throw new Error(`A origem da pergunta ${index + 1} é inválida.`);
    return { clientId: cleanText(question.clientId, 80) || `question-${index + 1}`, sourceQuestionId, title, type, required: question.required === true, options };
  });

  const intent = record.intent === "publish" ? "publish" : record.intent === "save" ? "save" : null;
  if (!intent) throw new Error("A ação solicitada é inválida.");
  const sectorIds = Array.isArray(record.sectorIds) ? [...new Set(record.sectorIds.map((id) => cleanText(id, 80)).filter((id) => uuidPattern.test(id)))].slice(0, 50) : [];
  if (intent === "publish" && sectorIds.length === 0) throw new Error("Selecione pelo menos um setor para publicar.");

  const identificationMode = ["ANONYMOUS", "OPTIONAL", "REQUIRED"].includes(String(record.identificationMode)) ? record.identificationMode as SurveyIdentificationMode : "ANONYMOUS";
  const identificationFields = identificationMode === "ANONYMOUS" || !Array.isArray(record.identificationFields) ? [] : [...new Set(record.identificationFields.map(String).filter((field) => allowedIdentificationFields.has(field)))];
  if (identificationMode === "REQUIRED" && identificationFields.length === 0) throw new Error("Escolha ao menos um campo de identificação obrigatória.");

  const alertThreshold = Number(record.alertThreshold);
  const duplicateWindowHours = Number(record.duplicateWindowHours);
  return {
    name,
    description: cleanText(record.description, 1_500) || undefined,
    questions,
    sectorIds,
    identificationMode,
    identificationFields,
    alertThreshold: Number.isInteger(alertThreshold) && alertThreshold >= 1 && alertThreshold <= 5 ? alertThreshold : 2,
    duplicateWindowHours: Number.isInteger(duplicateWindowHours) && duplicateWindowHours >= 1 && duplicateWindowHours <= 168 ? duplicateWindowHours : 12,
    intent,
  };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (user.role === "ANALYST") return NextResponse.json({ error: "Seu perfil não pode alterar pesquisas." }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ error: "Esta ação exige o PostgreSQL ativo." }, { status: 503 });

  try {
    const { id: surveyId } = await params;
    if (!uuidPattern.test(surveyId)) return NextResponse.json({ error: "Pesquisa inválida." }, { status: 400 });
    const input = parseInput(await request.json());
    const ownershipFilters = [eq(surveys.id, surveyId), eq(surveys.hospitalId, user.hospitalId)];
    if (user.role !== "ADMIN") ownershipFilters.push(eq(surveys.createdById, user.id));
    const [survey] = await getDatabase().select({ id: surveys.id }).from(surveys).where(and(...ownershipFilters)).limit(1);
    if (!survey) return NextResponse.json({ error: "Pesquisa não encontrada." }, { status: 404 });

    const [draft] = await getDatabase().select({ id: surveyVersions.id, version: surveyVersions.version }).from(surveyVersions).where(and(eq(surveyVersions.surveyId, surveyId), eq(surveyVersions.status, "DRAFT"))).orderBy(desc(surveyVersions.version)).limit(1);
    if (!draft) return NextResponse.json({ error: "Crie uma nova versão antes de editar uma pesquisa publicada." }, { status: 409 });

    if (input.intent === "publish") {
      const allowedSectorIds = new Set(await getAllowedSectorIds(user));
      if (input.sectorIds.some((sectorId) => !allowedSectorIds.has(sectorId))) return NextResponse.json({ error: "Um dos setores selecionados está fora do seu acesso." }, { status: 403 });
    }

    const sourceIds = input.questions.flatMap((question) => question.sourceQuestionId ? [question.sourceQuestionId] : []);
    if (sourceIds.length > 0) {
      const validSources = await getDatabase().select({ id: questionBank.id }).from(questionBank).where(and(eq(questionBank.hospitalId, user.hospitalId), inArray(questionBank.id, sourceIds)));
      const validIds = new Set(validSources.map((source) => source.id));
      if (sourceIds.some((id) => !validIds.has(id))) return NextResponse.json({ error: "Uma pergunta de origem não está mais disponível." }, { status: 400 });
    }

    const published = input.intent === "publish";
    await getDatabase().transaction(async (transaction) => {
      await transaction.update(surveys).set({ name: input.name, description: input.description, updatedAt: new Date() }).where(eq(surveys.id, surveyId));
      await transaction.update(surveyVersions).set({
        identificationMode: input.identificationMode,
        identificationFields: input.identificationFields,
        consentText: input.identificationMode === "ANONYMOUS" ? null : "Autorizo o uso dos dados informados para contato relacionado a esta avaliação.",
      }).where(eq(surveyVersions.id, draft.id));
      await transaction.delete(surveyQuestions).where(eq(surveyQuestions.surveyVersionId, draft.id));

      const questionValues = [];
      for (const [position, question] of input.questions.entries()) {
        let sourceQuestionId = question.sourceQuestionId;
        if (!sourceQuestionId) {
          const [bankQuestion] = await transaction.insert(questionBank).values({ hospitalId: user.hospitalId, createdById: user.id, category: "Pesquisa personalizada", title: question.title, type: question.type, options: question.options, shared: true }).returning({ id: questionBank.id });
          sourceQuestionId = bankQuestion.id;
        }
        questionValues.push({ surveyVersionId: draft.id, sourceQuestionId, position: position + 1, title: question.title, type: question.type, required: question.required, options: question.options });
      }
      await transaction.insert(surveyQuestions).values(questionValues);

      let targetCount = 0;
      if (published) {
        const previousPublications = await transaction
          .select({ id: publications.id })
          .from(publications)
          .innerJoin(surveyVersions, eq(surveyVersions.id, publications.surveyVersionId))
          .where(and(eq(surveyVersions.surveyId, surveyId), ne(surveyVersions.id, draft.id), inArray(publications.status, ["ACTIVE", "SCHEDULED"])));
        const previousPublicationIds = previousPublications.map((publication) => publication.id);
        if (previousPublicationIds.length > 0) {
          await transaction.update(publications).set({ status: "ENDED", endsAt: new Date() }).where(inArray(publications.id, previousPublicationIds));
          await transaction.update(publicationTargets).set({ active: false }).where(inArray(publicationTargets.publicationId, previousPublicationIds));
        }
        await transaction.update(surveyVersions).set({ status: "SUPERSEDED" }).where(and(eq(surveyVersions.surveyId, surveyId), eq(surveyVersions.status, "PUBLISHED"), ne(surveyVersions.id, draft.id)));
        await transaction.update(surveyVersions).set({ status: "PUBLISHED", publishedAt: new Date() }).where(eq(surveyVersions.id, draft.id));
        const [publication] = await transaction.insert(publications).values({ surveyVersionId: draft.id, createdById: user.id, status: "ACTIVE", startsAt: new Date(), alertThreshold: input.alertThreshold, duplicateWindowHours: input.duplicateWindowHours }).returning({ id: publications.id });
        const targets = input.sectorIds.map((sectorId) => ({ publicationId: publication.id, sectorId, publicToken: randomBytes(32).toString("base64url") }));
        await transaction.insert(publicationTargets).values(targets);
        targetCount = targets.length;
      }

      await transaction.insert(auditLogs).values({
        hospitalId: user.hospitalId,
        actorId: user.id,
        action: published ? "SURVEY_VERSION_PUBLISHED" : "SURVEY_DRAFT_UPDATED",
        entityType: "survey",
        entityId: surveyId,
        metadata: { version: draft.version, questionCount: input.questions.length, targetCount },
      });
    });

    return NextResponse.json({ id: surveyId, published, version: draft.version });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível atualizar a pesquisa.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
