import pg from "pg";

const { Client } = pg;
const baseUrl = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const databaseUrl = process.env.DATABASE_URL;
const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;

if (!databaseUrl || !adminEmail || !adminPassword) throw new Error("Defina as variáveis locais para o teste de ciclo de vida.");
if (!["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname) || !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)) throw new Error("O teste de ciclo de vida só pode ser executado localmente.");

const client = new Client({ connectionString: databaseUrl });
let surveyId;
let sourceQuestionIds = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cookieFrom(response) {
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

async function cleanup() {
  if (!surveyId) return;
  await client.query("BEGIN");
  try {
    const versions = await client.query("SELECT id FROM survey_versions WHERE survey_id = $1", [surveyId]);
    const versionIds = versions.rows.map((row) => row.id);
    if (versionIds.length > 0) {
      const publications = await client.query("SELECT id FROM publications WHERE survey_version_id = ANY($1::uuid[])", [versionIds]);
      const publicationIds = publications.rows.map((row) => row.id);
      if (publicationIds.length > 0) {
        const targets = await client.query("SELECT id FROM publication_targets WHERE publication_id = ANY($1::uuid[])", [publicationIds]);
        const targetIds = targets.rows.map((row) => row.id);
        if (targetIds.length > 0) {
          await client.query("DELETE FROM response_guards WHERE publication_target_id = ANY($1::uuid[])", [targetIds]);
          await client.query("DELETE FROM publication_targets WHERE id = ANY($1::uuid[])", [targetIds]);
        }
        await client.query("DELETE FROM publications WHERE id = ANY($1::uuid[])", [publicationIds]);
      }
      await client.query("DELETE FROM survey_questions WHERE survey_version_id = ANY($1::uuid[])", [versionIds]);
      await client.query("DELETE FROM survey_versions WHERE id = ANY($1::uuid[])", [versionIds]);
    }
    await client.query("DELETE FROM audit_logs WHERE entity_id = $1", [surveyId]);
    await client.query("DELETE FROM surveys WHERE id = $1", [surveyId]);
    if (sourceQuestionIds.length > 0) await client.query("DELETE FROM question_bank WHERE id = ANY($1::uuid[]) AND NOT EXISTS (SELECT 1 FROM survey_questions WHERE source_question_id = question_bank.id)", [sourceQuestionIds]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function lifecycle(cookie, action) {
  const response = await fetch(`${baseUrl}/api/surveys/${surveyId}/lifecycle`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ action }) });
  const result = await response.json();
  assert(response.ok, `${action} falhou: ${result.error ?? response.status}`);
  return result;
}

await client.connect();
try {
  const sectorRows = await client.query("SELECT id FROM sectors ORDER BY created_at LIMIT 2");
  assert(sectorRows.rowCount === 2, "O seed precisa conter ao menos dois setores.");
  const sectorIds = sectorRows.rows.map((row) => row.id);

  const login = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", body: new URLSearchParams({ email: adminEmail, password: adminPassword, remember: "on" }), redirect: "manual" });
  const cookie = cookieFrom(login);
  assert(login.status === 303 && cookie, "Falha no login administrativo.");

  const questions = [
    { clientId: "lifecycle-score", title: "Como você avalia o atendimento?", type: "STARS", required: true, options: [] },
    { clientId: "lifecycle-comment", title: "O que podemos melhorar?", type: "LONG_TEXT", required: false, options: [] },
  ];
  const basePayload = {
    name: `[E2E] Ciclo ${Date.now()}`,
    description: "Pesquisa temporária para validar o ciclo de vida.",
    questions,
    sectorIds,
    identificationMode: "ANONYMOUS",
    identificationFields: [],
    alertThreshold: 2,
    duplicateWindowHours: 12,
  };
  const draftResponse = await fetch(`${baseUrl}/api/surveys`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ ...basePayload, intent: "draft" }) });
  const draft = await draftResponse.json();
  assert(draftResponse.status === 201 && draft.id, `Criação do rascunho falhou: ${draft.error ?? draftResponse.status}`);
  surveyId = draft.id;

  const initialState = await client.query("SELECT status FROM survey_versions WHERE survey_id = $1", [surveyId]);
  assert(initialState.rows.length === 1 && initialState.rows[0].status === "DRAFT", "A pesquisa deveria começar como rascunho.");

  const publishResponse = await fetch(`${baseUrl}/api/surveys/${surveyId}`, { method: "PATCH", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ ...basePayload, intent: "publish" }) });
  const published = await publishResponse.json();
  assert(publishResponse.ok && published.version === 1, `Publicação do rascunho falhou: ${published.error ?? publishResponse.status}`);
  let targets = await client.query("SELECT pt.public_token, pt.active FROM publication_targets pt JOIN publications p ON p.id = pt.publication_id JOIN survey_versions sv ON sv.id = p.survey_version_id WHERE sv.survey_id = $1 AND p.status = 'ACTIVE'", [surveyId]);
  assert(targets.rows.length === 2, "A versão 1 deveria ter dois QR Codes ativos.");
  const oldToken = targets.rows[0].public_token;
  assert((await fetch(`${baseUrl}/responder/${oldToken}`)).status === 200, "A versão publicada deveria aceitar respostas.");

  await lifecycle(cookie, "PAUSE");
  assert((await fetch(`${baseUrl}/responder/${oldToken}`)).status === 404, "A pesquisa pausada não deveria aceitar respostas.");
  assert((await fetch(`${baseUrl}/api/qr/${oldToken}`)).status === 200, "O QR Code deve ser preservado durante a pausa.");
  await lifecycle(cookie, "RESUME");
  assert((await fetch(`${baseUrl}/responder/${oldToken}`)).status === 200, "A pesquisa retomada deveria aceitar respostas.");

  const versionResult = await lifecycle(cookie, "NEW_VERSION");
  assert(versionResult.created === true, "A nova versão deveria criar um rascunho.");
  const versionTwoPayload = { ...basePayload, name: `${basePayload.name} v2`, questions: [...questions, { clientId: "lifecycle-nps", title: "Você recomendaria o atendimento?", type: "NPS", required: false, options: [] }], intent: "publish" };
  const versionTwoResponse = await fetch(`${baseUrl}/api/surveys/${surveyId}`, { method: "PATCH", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(versionTwoPayload) });
  const versionTwo = await versionTwoResponse.json();
  assert(versionTwoResponse.ok && versionTwo.version === 2, `Publicação da versão 2 falhou: ${versionTwo.error ?? versionTwoResponse.status}`);

  const versionState = await client.query("SELECT version, status FROM survey_versions WHERE survey_id = $1 ORDER BY version", [surveyId]);
  assert(versionState.rows[0].status === "SUPERSEDED" && versionState.rows[1].status === "PUBLISHED", "A versão 2 deveria substituir a versão 1.");
  assert((await fetch(`${baseUrl}/responder/${oldToken}`)).status === 404, "O QR Code antigo não deveria aceitar respostas após a substituição.");
  targets = await client.query("SELECT pt.public_token FROM publication_targets pt JOIN publications p ON p.id = pt.publication_id JOIN survey_versions sv ON sv.id = p.survey_version_id WHERE sv.survey_id = $1 AND p.status = 'ACTIVE'", [surveyId]);
  assert(targets.rows.length === 2, "A versão 2 deveria ter dois novos QR Codes.");
  const newToken = targets.rows[0].public_token;
  assert((await fetch(`${baseUrl}/responder/${newToken}`)).status === 200, "A versão 2 deveria aceitar respostas.");

  await lifecycle(cookie, "END");
  assert((await fetch(`${baseUrl}/responder/${newToken}`)).status === 404, "A pesquisa encerrada não deveria aceitar respostas.");
  const sources = await client.query("SELECT DISTINCT sq.source_question_id FROM survey_questions sq JOIN survey_versions sv ON sv.id = sq.survey_version_id WHERE sv.survey_id = $1 AND sq.source_question_id IS NOT NULL", [surveyId]);
  sourceQuestionIds = sources.rows.map((row) => row.source_question_id);

  console.log("Ciclo de vida aprovado: rascunho, publicação, pausa, retomada, nova versão, troca de QR e encerramento.");
} finally {
  await cleanup();
  await client.end();
}
