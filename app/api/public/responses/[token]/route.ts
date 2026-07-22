import { createCipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import {
  alerts,
  answers,
  publicationTargets,
  publications,
  responseGuards,
  responseIdentities,
  responses,
  surveyQuestions,
  surveyVersions,
} from "../../../../../db/schema";
import { getDatabase, isDemoMode } from "../../../../../lib/database";
import { getPublicSurvey } from "../../../../../lib/surveys";
import type { PublicSurveyQuestion } from "../../../../../lib/survey-types";

export const runtime = "nodejs";

class InputError extends Error {}
class DuplicateResponseError extends Error {}

function hasValue(value: unknown) {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function validateAnswer(question: PublicSurveyQuestion, value: unknown): string | number | boolean | string[] | undefined {
  if (!hasValue(value)) {
    if (question.required) throw new InputError(`Responda a pergunta: “${question.title}”.`);
    return undefined;
  }

  switch (question.type) {
    case "STARS":
      if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5) throw new InputError("Uma avaliação por estrelas é inválida.");
      return Number(value);
    case "NPS":
      if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 10) throw new InputError("Uma avaliação de 0 a 10 é inválida.");
      return Number(value);
    case "YES_NO":
      if (typeof value !== "boolean") throw new InputError("Uma resposta de sim ou não é inválida.");
      return value;
    case "SINGLE_CHOICE":
      if (typeof value !== "string" || !question.options.includes(value)) throw new InputError("Uma opção selecionada é inválida.");
      return value;
    case "MULTIPLE_CHOICE": {
      if (!Array.isArray(value)) throw new InputError("Uma resposta de múltipla escolha é inválida.");
      const selected = [...new Set(value.filter((item): item is string => typeof item === "string"))];
      if (selected.length === 0 || selected.some((item) => !question.options.includes(item))) throw new InputError("Uma opção selecionada é inválida.");
      return selected;
    }
    case "SHORT_TEXT":
    case "LONG_TEXT": {
      if (typeof value !== "string") throw new InputError("Uma resposta escrita é inválida.");
      const maximum = question.type === "SHORT_TEXT" ? 500 : 3_000;
      const text = value.trim().slice(0, maximum);
      if (!text && question.required) throw new InputError(`Responda a pergunta: “${question.title}”.`);
      return text || undefined;
    }
  }
}

function cleanIdentityValue(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function encryptIdentity(value: string, secret: string) {
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (isDemoMode()) return NextResponse.json({ error: "Esta é uma prévia e não recebe respostas." }, { status: 503 });
  const { token } = await params;
  const survey = await getPublicSurvey(token);
  if (!survey) return NextResponse.json({ error: "Esta pesquisa não está disponível." }, { status: 404 });

  try {
    const body = await request.json() as Record<string, unknown>;
    if (!Array.isArray(body.answers)) throw new InputError("As respostas enviadas são inválidas.");
    const incomingAnswers = new Map<string, unknown>();
    for (const item of body.answers) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      if (typeof record.questionId === "string" && !incomingAnswers.has(record.questionId)) incomingAnswers.set(record.questionId, record.value);
    }

    const validatedAnswers = survey.questions.flatMap((question) => {
      const value = validateAnswer(question, incomingAnswers.get(question.id));
      return value === undefined ? [] : [{ questionId: question.id, type: question.type, value }];
    });

    const identityRecord = body.identity && typeof body.identity === "object" ? body.identity as Record<string, unknown> : null;
    const identified = survey.identificationMode !== "ANONYMOUS" && identityRecord !== null;
    if (survey.identificationMode === "REQUIRED" && !identified) throw new InputError("A identificação é obrigatória nesta pesquisa.");

    const identity = {
      name: cleanIdentityValue(identityRecord?.name, 200),
      contact: cleanIdentityValue(identityRecord?.contact, 254),
      age: cleanIdentityValue(identityRecord?.age, 80),
      sex: cleanIdentityValue(identityRecord?.sex, 80),
      consent: identityRecord?.consent === true,
    };
    if (identified) {
      const missingField = survey.identificationFields.find((field) => !identity[field as keyof typeof identity]);
      if (missingField || !identity.consent) throw new InputError("Preencha a identificação e confirme o consentimento.");
    }

    const [target] = await getDatabase()
      .select({
        id: publicationTargets.id,
        sectorId: publicationTargets.sectorId,
        versionId: surveyVersions.id,
        alertThreshold: publications.alertThreshold,
        duplicateWindowHours: publications.duplicateWindowHours,
      })
      .from(publicationTargets)
      .innerJoin(publications, eq(publications.id, publicationTargets.publicationId))
      .innerJoin(surveyVersions, eq(surveyVersions.id, publications.surveyVersionId))
      .where(and(eq(publicationTargets.publicToken, token), eq(publicationTargets.active, true), eq(publications.status, "ACTIVE")))
      .limit(1);
    if (!target) return NextResponse.json({ error: "Esta pesquisa não está disponível." }, { status: 404 });

    const expectedQuestionIds = await getDatabase().select({ id: surveyQuestions.id }).from(surveyQuestions).where(eq(surveyQuestions.surveyVersionId, target.versionId));
    const expectedSet = new Set(expectedQuestionIds.map((question) => question.id));
    if (validatedAnswers.some((answer) => !expectedSet.has(answer.questionId))) throw new InputError("Uma pergunta enviada não pertence a esta pesquisa.");

    const sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret) throw new Error("SESSION_SECRET não foi configurado.");
    const deviceId = request.cookies.get("vp_device")?.value || randomBytes(24).toString("base64url");
    const deviceFingerprintHash = createHmac("sha256", sessionSecret).update(`${target.id}:${deviceId}`).digest("hex");
    const identitySecret = process.env.IDENTITY_ENCRYPTION_KEY;
    if (identified && !identitySecret) throw new Error("IDENTITY_ENCRYPTION_KEY não foi configurada.");

    const starAnswers = validatedAnswers.filter((answer) => answer.type === "STARS").map((answer) => Number(answer.value));
    const overallScore = starAnswers.length > 0 ? Math.round(starAnswers.reduce((total, score) => total + score, 0) / starAnswers.length) : null;
    const now = new Date();
    const blockedUntil = new Date(now.getTime() + target.duplicateWindowHours * 60 * 60 * 1_000);

    const responseId = await getDatabase().transaction(async (transaction) => {
      const [existingGuard] = await transaction.select({ id: responseGuards.id, blockedUntil: responseGuards.blockedUntil }).from(responseGuards).where(and(eq(responseGuards.publicationTargetId, target.id), eq(responseGuards.deviceFingerprintHash, deviceFingerprintHash))).limit(1);
      if (!existingGuard) {
        const inserted = await transaction.insert(responseGuards).values({ publicationTargetId: target.id, deviceFingerprintHash, blockedUntil }).onConflictDoNothing().returning({ id: responseGuards.id });
        if (inserted.length === 0) throw new DuplicateResponseError();
      } else {
        if (existingGuard.blockedUntil > now) throw new DuplicateResponseError();
        const updated = await transaction.update(responseGuards).set({ blockedUntil, createdAt: now }).where(and(eq(responseGuards.id, existingGuard.id), lte(responseGuards.blockedUntil, now))).returning({ id: responseGuards.id });
        if (updated.length === 0) throw new DuplicateResponseError();
      }

      const [createdResponse] = await transaction.insert(responses).values({ publicationTargetId: target.id, identified, overallScore }).returning({ id: responses.id });
      if (validatedAnswers.length > 0) await transaction.insert(answers).values(validatedAnswers.map((answer) => ({ responseId: createdResponse.id, questionId: answer.questionId, value: answer.value })));

      if (identified && identitySecret) {
        await transaction.insert(responseIdentities).values({
          responseId: createdResponse.id,
          nameCiphertext: identity.name ? encryptIdentity(identity.name, identitySecret) : null,
          contactCiphertext: identity.contact ? encryptIdentity(identity.contact, identitySecret) : null,
          demographicsCiphertext: identity.age || identity.sex ? encryptIdentity(JSON.stringify({ age: identity.age || null, sex: identity.sex || null }), identitySecret) : null,
          encryptionKeyVersion: 1,
          consentAt: now,
        });
      }

      if (overallScore !== null && overallScore <= target.alertThreshold) {
        await transaction.insert(alerts).values({
          responseId: createdResponse.id,
          sectorId: target.sectorId,
          reason: `Avaliação geral de ${overallScore} estrela${overallScore === 1 ? "" : "s"}, abaixo do limite de ${target.alertThreshold}.`,
        });
      }
      return createdResponse.id;
    });

    const response = NextResponse.json({ ok: true, responseId }, { status: 201 });
    response.cookies.set("vp_device", deviceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    if (error instanceof DuplicateResponseError) return NextResponse.json({ error: "Uma resposta deste aparelho já foi registrada recentemente." }, { status: 409 });
    if (error instanceof InputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Falha ao registrar resposta pública", error);
    return NextResponse.json({ error: "Não foi possível registrar sua avaliação agora. Tente novamente em instantes." }, { status: 500 });
  }
}
