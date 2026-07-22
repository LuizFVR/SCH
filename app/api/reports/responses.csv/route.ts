import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import {
  answers,
  auditLogs,
  publicationTargets,
  publications,
  responses,
  sectors,
  surveyQuestions,
  surveys,
  surveyVersions,
  units,
} from "../../../../db/schema";
import { getCurrentUser } from "../../../../lib/auth";
import { getDatabase, isDemoMode } from "../../../../lib/database";
import { getAllowedSectorIds } from "../../../../lib/surveys";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function csvValue(value: unknown) {
  let text = value === null || value === undefined ? "" : Array.isArray(value) ? value.map(String).join("; ") : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ error: "A exportação exige o banco de dados ativo." }, { status: 503 });

  const requestedDays = Number(request.nextUrl.searchParams.get("days"));
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
  const requestedSectorId = request.nextUrl.searchParams.get("sectorId") || undefined;
  const requestedSurveyId = request.nextUrl.searchParams.get("surveyId") || undefined;
  if ((requestedSectorId && !uuidPattern.test(requestedSectorId)) || (requestedSurveyId && !uuidPattern.test(requestedSurveyId))) {
    return NextResponse.json({ error: "Filtro inválido." }, { status: 400 });
  }

  const allowedSectorIds = await getAllowedSectorIds(user);
  if (requestedSectorId && !allowedSectorIds.includes(requestedSectorId)) return NextResponse.json({ error: "Setor fora do seu acesso." }, { status: 403 });
  const scopedSectorIds = requestedSectorId ? [requestedSectorId] : allowedSectorIds;
  if (scopedSectorIds.length === 0) return new Response("\uFEFFData,Pesquisa,Unidade,Setor,Nota geral,Identificada,Pergunta,Tipo,Resposta\r\n", { headers: { "content-type": "text/csv; charset=utf-8" } });

  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
  const filters = [inArray(sectors.id, scopedSectorIds), gte(responses.submittedAt, startDate)];
  if (requestedSurveyId) filters.push(eq(surveys.id, requestedSurveyId));

  const rows = await getDatabase()
    .select({
      submittedAt: responses.submittedAt,
      surveyName: surveys.name,
      unitName: units.name,
      sectorName: sectors.name,
      overallScore: responses.overallScore,
      identified: responses.identified,
      question: surveyQuestions.title,
      questionType: surveyQuestions.type,
      value: answers.value,
    })
    .from(answers)
    .innerJoin(responses, eq(responses.id, answers.responseId))
    .innerJoin(surveyQuestions, eq(surveyQuestions.id, answers.questionId))
    .innerJoin(publicationTargets, eq(publicationTargets.id, responses.publicationTargetId))
    .innerJoin(publications, eq(publications.id, publicationTargets.publicationId))
    .innerJoin(surveyVersions, eq(surveyVersions.id, publications.surveyVersionId))
    .innerJoin(surveys, eq(surveys.id, surveyVersions.surveyId))
    .innerJoin(sectors, eq(sectors.id, publicationTargets.sectorId))
    .innerJoin(units, eq(units.id, sectors.unitId))
    .where(and(...filters))
    .orderBy(asc(responses.submittedAt), asc(surveyQuestions.position))
    .limit(100_000);

  const header = ["Data", "Pesquisa", "Unidade", "Setor", "Nota geral", "Identificada", "Pergunta", "Tipo", "Resposta"];
  const csvRows = rows.map((row) => [row.submittedAt.toISOString(), row.surveyName, row.unitName, row.sectorName, row.overallScore, row.identified ? "Sim" : "Não", row.question, row.questionType, row.value].map(csvValue).join(","));
  const csv = `\uFEFF${header.map(csvValue).join(",")}\r\n${csvRows.join("\r\n")}`;

  await getDatabase().insert(auditLogs).values({
    hospitalId: user.hospitalId,
    actorId: user.id,
    action: "RESPONSES_EXPORTED",
    entityType: "report",
    metadata: { days, sectorId: requestedSectorId ?? null, surveyId: requestedSurveyId ?? null, rows: rows.length },
  });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="respostas-${date}.csv"`,
      "cache-control": "private, no-store",
      "x-exported-rows": String(rows.length),
    },
  });
}
