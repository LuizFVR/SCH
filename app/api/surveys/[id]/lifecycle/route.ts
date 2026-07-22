import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  auditLogs,
  publicationTargets,
  publications,
  surveyQuestions,
  surveys,
  surveyVersions,
} from "../../../../../db/schema";
import { adminUrl } from "../../../../../lib/admin-url";
import { getCurrentUser } from "../../../../../lib/auth";
import { getDatabase, isDemoMode } from "../../../../../lib/database";
import { getAllowedSectorIds } from "../../../../../lib/surveys";

export const runtime = "nodejs";

type LifecycleAction = "NEW_VERSION" | "PAUSE" | "RESUME" | "END";

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(adminUrl(path, request), 303);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return redirectTo(request, "/login");
  if (user.role === "ANALYST") return NextResponse.json({ error: "Seu perfil não pode alterar pesquisas." }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ error: "Esta ação exige o PostgreSQL ativo." }, { status: 503 });

  const { id: surveyId } = await params;
  const contentType = request.headers.get("content-type") ?? "";
  const action = contentType.includes("application/json")
    ? String((await request.json() as { action?: string }).action ?? "") as LifecycleAction
    : String((await request.formData()).get("action") ?? "") as LifecycleAction;
  if (!["NEW_VERSION", "PAUSE", "RESUME", "END"].includes(action)) return NextResponse.json({ error: "Ação inválida." }, { status: 400 });

  const ownershipFilters = [eq(surveys.id, surveyId), eq(surveys.hospitalId, user.hospitalId)];
  if (user.role !== "ADMIN") ownershipFilters.push(eq(surveys.createdById, user.id));
  const [survey] = await getDatabase().select({ id: surveys.id }).from(surveys).where(and(...ownershipFilters)).limit(1);
  if (!survey) return NextResponse.json({ error: "Pesquisa não encontrada." }, { status: 404 });

  if (action === "NEW_VERSION") {
    const result = await getDatabase().transaction(async (transaction) => {
      const versions = await transaction
        .select({
          id: surveyVersions.id,
          version: surveyVersions.version,
          status: surveyVersions.status,
          identificationMode: surveyVersions.identificationMode,
          identificationFields: surveyVersions.identificationFields,
          consentText: surveyVersions.consentText,
        })
        .from(surveyVersions)
        .where(eq(surveyVersions.surveyId, surveyId))
        .orderBy(desc(surveyVersions.version));
      const existingDraft = versions.find((version) => version.status === "DRAFT");
      if (existingDraft) return { versionId: existingDraft.id, created: false };
      const sourceVersion = versions[0];
      if (!sourceVersion) throw new Error("A pesquisa não possui versão para copiar.");

      const [newVersion] = await transaction.insert(surveyVersions).values({
        surveyId,
        version: sourceVersion.version + 1,
        status: "DRAFT",
        identificationMode: sourceVersion.identificationMode,
        identificationFields: sourceVersion.identificationFields,
        consentText: sourceVersion.consentText,
      }).returning({ id: surveyVersions.id });
      const questions = await transaction.select().from(surveyQuestions).where(eq(surveyQuestions.surveyVersionId, sourceVersion.id));
      if (questions.length > 0) {
        await transaction.insert(surveyQuestions).values(questions.map((question) => ({
          surveyVersionId: newVersion.id,
          sourceQuestionId: question.sourceQuestionId,
          position: question.position,
          title: question.title,
          type: question.type,
          required: question.required,
          options: question.options,
          rules: question.rules,
        })));
      }
      await transaction.insert(auditLogs).values({
        hospitalId: user.hospitalId,
        actorId: user.id,
        action: "SURVEY_VERSION_CREATED",
        entityType: "survey",
        entityId: surveyId,
        metadata: { version: sourceVersion.version + 1 },
      });
      return { versionId: newVersion.id, created: true };
    });
    if (contentType.includes("application/json")) return NextResponse.json(result, { status: result.created ? 201 : 200 });
    return redirectTo(request, `/pesquisas/${surveyId}/editar`);
  }

  const expectedStatus = action === "PAUSE" ? "ACTIVE" : action === "RESUME" ? "SCHEDULED" : undefined;
  const publicationRows = await getDatabase()
    .select({ id: publications.id, status: publications.status, sectorId: publicationTargets.sectorId })
    .from(publications)
    .innerJoin(surveyVersions, eq(surveyVersions.id, publications.surveyVersionId))
    .innerJoin(publicationTargets, eq(publicationTargets.publicationId, publications.id))
    .where(and(eq(surveyVersions.surveyId, surveyId), expectedStatus ? eq(publications.status, expectedStatus) : inArray(publications.status, ["ACTIVE", "SCHEDULED"])))
    .orderBy(desc(publications.createdAt));
  const publicationId = publicationRows[0]?.id;
  if (!publicationId) return NextResponse.json({ error: "Não existe publicação compatível com esta ação." }, { status: 409 });

  const publicationTargetsInScope = publicationRows.filter((row) => row.id === publicationId);
  const allowedSectorIds = new Set(await getAllowedSectorIds(user));
  if (publicationTargetsInScope.some((target) => !allowedSectorIds.has(target.sectorId))) {
    return NextResponse.json({ error: "A publicação contém um setor fora do seu acesso atual." }, { status: 403 });
  }

  const nextStatus = action === "PAUSE" ? "SCHEDULED" : action === "RESUME" ? "ACTIVE" : "ENDED";
  await getDatabase().transaction(async (transaction) => {
    await transaction.update(publications).set({ status: nextStatus, endsAt: action === "END" ? new Date() : null }).where(eq(publications.id, publicationId));
    if (action === "END") await transaction.update(publicationTargets).set({ active: false }).where(eq(publicationTargets.publicationId, publicationId));
    if (action === "RESUME") await transaction.update(publicationTargets).set({ active: true }).where(eq(publicationTargets.publicationId, publicationId));
    await transaction.insert(auditLogs).values({
      hospitalId: user.hospitalId,
      actorId: user.id,
      action: `SURVEY_${action}`,
      entityType: "survey",
      entityId: surveyId,
      metadata: { publicationId },
    });
  });

  if (contentType.includes("application/json")) return NextResponse.json({ ok: true, status: nextStatus });
  return redirectTo(request, `/pesquisas/${surveyId}`);
}
