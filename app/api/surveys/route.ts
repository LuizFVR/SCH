import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  auditLogs,
  publicationTargets,
  publications,
  questionBank,
  surveyQuestions,
  surveys,
  surveyVersions,
} from "../../../db/schema";
import { getCurrentUser } from "../../../lib/auth";
import { getDatabase, isDemoMode } from "../../../lib/database";
import { getAllowedSectorIds } from "../../../lib/surveys";
import { QUESTION_TYPES, type CreateSurveyInput, type SurveyQuestionInput } from "../../../lib/survey-types";

export const runtime = "nodejs";

const allowedIdentificationFields = new Set(["name", "contact", "age", "sex"]);

function cleanText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function parseQuestion(value: unknown, index: number): SurveyQuestionInput {
  if (!value || typeof value !== "object") throw new Error(`A pergunta ${index + 1} é inválida.`);
  const record = value as Record<string, unknown>;
  const title = cleanText(record.title, 500);
  if (title.length < 3) throw new Error(`Informe o texto da pergunta ${index + 1}.`);
  if (typeof record.type !== "string" || !QUESTION_TYPES.includes(record.type as SurveyQuestionInput["type"])) {
    throw new Error(`O tipo da pergunta ${index + 1} é inválido.`);
  }

  const type = record.type as SurveyQuestionInput["type"];
  const options = Array.isArray(record.options)
    ? [...new Set(record.options.map((option) => cleanText(option, 120)).filter(Boolean))].slice(0, 15)
    : [];
  if ((type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE") && options.length < 2) {
    throw new Error(`Adicione pelo menos duas opções à pergunta ${index + 1}.`);
  }

  return {
    clientId: cleanText(record.clientId, 80) || `question-${index + 1}`,
    sourceQuestionId: cleanText(record.sourceQuestionId, 80) || undefined,
    title,
    type,
    required: record.required === true,
    options,
  };
}

function parseInput(value: unknown): CreateSurveyInput {
  if (!value || typeof value !== "object") throw new Error("Dados da pesquisa inválidos.");
  const record = value as Record<string, unknown>;
  const name = cleanText(record.name, 200);
  if (name.length < 3) throw new Error("Informe um nome para a pesquisa.");

  if (!Array.isArray(record.questions) || record.questions.length === 0 || record.questions.length > 50) {
    throw new Error("A pesquisa deve ter entre 1 e 50 perguntas.");
  }
  const questions = record.questions.map(parseQuestion);

  const intent = record.intent === "draft" ? "draft" : record.intent === "publish" ? "publish" : null;
  if (!intent) throw new Error("A ação solicitada é inválida.");

  const sectorIds = Array.isArray(record.sectorIds)
    ? [...new Set(record.sectorIds.map((id) => cleanText(id, 80)).filter(Boolean))].slice(0, 50)
    : [];
  if (intent === "publish" && sectorIds.length === 0) throw new Error("Selecione pelo menos um setor para publicar.");

  const identificationMode = ["ANONYMOUS", "OPTIONAL", "REQUIRED"].includes(String(record.identificationMode))
    ? record.identificationMode as CreateSurveyInput["identificationMode"]
    : "ANONYMOUS";
  const identificationFields = identificationMode === "ANONYMOUS" || !Array.isArray(record.identificationFields)
    ? []
    : [...new Set(record.identificationFields.map(String).filter((field) => allowedIdentificationFields.has(field)))];
  if (identificationMode === "REQUIRED" && identificationFields.length === 0) {
    throw new Error("Escolha ao menos um campo de identificação obrigatória.");
  }

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

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (user.role === "ANALYST") return NextResponse.json({ error: "Seu perfil não pode criar pesquisas." }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ error: "A gravação fica disponível ao conectar o PostgreSQL e desativar o modo de demonstração." }, { status: 503 });

  try {
    const input = parseInput(await request.json());
    const allowedSectorIds = new Set(await getAllowedSectorIds(user));
    if (input.sectorIds.some((sectorId) => !allowedSectorIds.has(sectorId))) {
      return NextResponse.json({ error: "Um dos setores selecionados está fora do seu acesso." }, { status: 403 });
    }

    const sourceIds = input.questions.flatMap((question) => question.sourceQuestionId ? [question.sourceQuestionId] : []);
    let validSourceIds = new Set<string>();
    if (sourceIds.length > 0) {
      const rows = await getDatabase()
        .select({ id: questionBank.id })
        .from(questionBank)
        .where(and(eq(questionBank.hospitalId, user.hospitalId), inArray(questionBank.id, sourceIds), eq(questionBank.shared, true)));
      validSourceIds = new Set(rows.map((row) => row.id));
      if (sourceIds.some((id) => !validSourceIds.has(id))) {
        return NextResponse.json({ error: "Uma pergunta clonada não está mais disponível." }, { status: 400 });
      }
    }

    const result = await getDatabase().transaction(async (transaction) => {
      const [survey] = await transaction.insert(surveys).values({
        hospitalId: user.hospitalId,
        createdById: user.id,
        name: input.name,
        description: input.description,
      }).returning({ id: surveys.id });

      const published = input.intent === "publish";
      const [version] = await transaction.insert(surveyVersions).values({
        surveyId: survey.id,
        version: 1,
        status: published ? "PUBLISHED" : "DRAFT",
        identificationMode: input.identificationMode,
        identificationFields: input.identificationFields,
        consentText: input.identificationMode === "ANONYMOUS" ? null : "Autorizo o uso dos dados informados para contato relacionado a esta avaliação.",
        publishedAt: published ? new Date() : null,
      }).returning({ id: surveyVersions.id });

      const questionValues = [];
      for (const [position, question] of input.questions.entries()) {
        let sourceQuestionId = question.sourceQuestionId;
        if (!sourceQuestionId) {
          const [bankQuestion] = await transaction.insert(questionBank).values({
            hospitalId: user.hospitalId,
            createdById: user.id,
            category: "Pesquisa personalizada",
            title: question.title,
            type: question.type,
            options: question.options,
            shared: true,
          }).returning({ id: questionBank.id });
          sourceQuestionId = bankQuestion.id;
        }

        questionValues.push({
          surveyVersionId: version.id,
          sourceQuestionId,
          position: position + 1,
          title: question.title,
          type: question.type,
          required: question.required,
          options: question.options,
        });
      }
      await transaction.insert(surveyQuestions).values(questionValues);

      let targetCount = 0;
      if (published) {
        const [publication] = await transaction.insert(publications).values({
          surveyVersionId: version.id,
          createdById: user.id,
          status: "ACTIVE",
          startsAt: new Date(),
          alertThreshold: input.alertThreshold,
          duplicateWindowHours: input.duplicateWindowHours,
        }).returning({ id: publications.id });

        const targetValues = input.sectorIds.map((sectorId) => ({
          publicationId: publication.id,
          sectorId,
          publicToken: randomBytes(32).toString("base64url"),
        }));
        await transaction.insert(publicationTargets).values(targetValues);
        targetCount = targetValues.length;
      }

      await transaction.insert(auditLogs).values({
        hospitalId: user.hospitalId,
        actorId: user.id,
        action: published ? "SURVEY_PUBLISHED" : "SURVEY_DRAFT_CREATED",
        entityType: "survey",
        entityId: survey.id,
        metadata: { questionCount: input.questions.length, targetCount },
      });

      return { id: survey.id, published, targetCount };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível salvar a pesquisa.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
