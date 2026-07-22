import pg from "pg";

const { Client } = pg;
const baseUrl = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const databaseUrl = process.env.DATABASE_URL;
const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;

if (!databaseUrl || !adminEmail || !adminPassword || !process.env.IDENTITY_ENCRYPTION_KEY) {
  throw new Error("Defina banco, administrador inicial e IDENTITY_ENCRYPTION_KEY para o teste integrado.");
}

const applicationHost = new URL(baseUrl).hostname;
const databaseHost = new URL(databaseUrl).hostname;
if (!["localhost", "127.0.0.1"].includes(applicationHost) || !["localhost", "127.0.0.1"].includes(databaseHost)) {
  throw new Error("O teste integrado só pode ser executado contra a aplicação e o banco locais.");
}

const client = new Client({ connectionString: databaseUrl });
let surveyId;
let responseId;
let sourceQuestionIds = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cookieFrom(response) {
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

async function cleanup() {
  if (responseId) await client.query("DELETE FROM audit_logs WHERE entity_type = 'response' AND entity_id = $1", [responseId]);
  if (!surveyId) return;
  await client.query("BEGIN");
  try {
    const versions = await client.query("SELECT id FROM survey_versions WHERE survey_id = $1", [surveyId]);
    const versionIds = versions.rows.map((row) => row.id);
    if (versionIds.length > 0) {
      const publicationRows = await client.query("SELECT id FROM publications WHERE survey_version_id = ANY($1::uuid[])", [versionIds]);
      const publicationIds = publicationRows.rows.map((row) => row.id);
      if (publicationIds.length > 0) {
        const targetRows = await client.query("SELECT id FROM publication_targets WHERE publication_id = ANY($1::uuid[])", [publicationIds]);
        const targetIds = targetRows.rows.map((row) => row.id);
        if (targetIds.length > 0) {
          const responseRows = await client.query("SELECT id FROM responses WHERE publication_target_id = ANY($1::uuid[])", [targetIds]);
          const responseIds = responseRows.rows.map((row) => row.id);
          if (responseIds.length > 0) {
            await client.query("DELETE FROM alerts WHERE response_id = ANY($1::uuid[])", [responseIds]);
            await client.query("DELETE FROM answers WHERE response_id = ANY($1::uuid[])", [responseIds]);
            await client.query("DELETE FROM response_identities WHERE response_id = ANY($1::uuid[])", [responseIds]);
            await client.query("DELETE FROM responses WHERE id = ANY($1::uuid[])", [responseIds]);
          }
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
    if (sourceQuestionIds.length > 0) {
      await client.query("DELETE FROM question_bank WHERE id = ANY($1::uuid[]) AND NOT EXISTS (SELECT 1 FROM survey_questions WHERE source_question_id = question_bank.id)", [sourceQuestionIds]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

await client.connect();

try {
  const sectorRows = await client.query("SELECT s.id FROM sectors s JOIN units u ON u.id = s.unit_id ORDER BY u.name, s.name LIMIT 1");
  assert(sectorRows.rowCount === 1, "O seed precisa conter ao menos um setor.");

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    body: new URLSearchParams({ email: adminEmail, password: adminPassword, remember: "on" }),
    redirect: "manual",
  });
  assert(loginResponse.status === 303, `Login retornou HTTP ${loginResponse.status}.`);
  const adminCookie = cookieFrom(loginResponse);
  assert(adminCookie, "O login não retornou o cookie de sessão.");

  const createResponse = await fetch(`${baseUrl}/api/surveys`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({
      name: `[E2E] Consulta segura ${Date.now()}`,
      description: "Pesquisa temporária do teste de acesso às respostas.",
      questions: [
        { clientId: "response-score", title: "Como você avalia o atendimento?", type: "STARS", required: true, options: [] },
        { clientId: "response-comment", title: "Conte como foi sua experiência.", type: "LONG_TEXT", required: false, options: [] },
      ],
      sectorIds: [sectorRows.rows[0].id],
      identificationMode: "OPTIONAL",
      identificationFields: ["name", "contact", "age", "sex"],
      alertThreshold: 2,
      duplicateWindowHours: 1,
      intent: "publish",
    }),
  });
  const created = await createResponse.json();
  assert(createResponse.status === 201 && created.id, `Publicação falhou: ${created.error ?? createResponse.status}`);
  surveyId = created.id;

  const publicationRows = await client.query(`
    SELECT pt.public_token, sq.id AS question_id, sq.type, sq.source_question_id
    FROM survey_versions sv
    JOIN survey_questions sq ON sq.survey_version_id = sv.id
    JOIN publications p ON p.survey_version_id = sv.id
    JOIN publication_targets pt ON pt.publication_id = p.id
    WHERE sv.survey_id = $1
    ORDER BY sq.position
  `, [surveyId]);
  assert(publicationRows.rowCount === 2, "A pesquisa deveria conter duas perguntas.");
  sourceQuestionIds = publicationRows.rows.map((row) => row.source_question_id).filter(Boolean);
  const token = publicationRows.rows[0].public_token;

  const knownName = "Paciente Respostas E2E";
  const knownContact = "respostas-e2e@local.invalid";
  const answerResponse = await fetch(`${baseUrl}/api/public/responses/${token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      answers: publicationRows.rows.map((question) => ({
        questionId: question.question_id,
        value: question.type === "STARS" ? 5 : "Atendimento validado pelo teste integrado.",
      })),
      identity: { name: knownName, contact: knownContact, age: "30 a 44 anos", sex: "Feminino", consent: true },
    }),
  });
  const answered = await answerResponse.json();
  assert(answerResponse.status === 201 && answered.responseId, `Resposta pública falhou: ${answered.error ?? answerResponse.status}`);
  responseId = answered.responseId;

  const listPage = await fetch(`${baseUrl}/respostas`, { headers: { cookie: adminCookie } });
  const listHtml = await listPage.text();
  assert(listPage.status === 200 && listHtml.includes(responseId), "A resposta criada não apareceu na listagem autorizada.");

  const hiddenPage = await fetch(`${baseUrl}/respostas/${responseId}`, { headers: { cookie: adminCookie } });
  const hiddenHtml = await hiddenPage.text();
  assert(hiddenPage.status === 200, `O detalhe da resposta retornou HTTP ${hiddenPage.status}.`);
  assert(!hiddenHtml.includes(knownName) && !hiddenHtml.includes(knownContact), "A identificação foi exposta sem solicitação explícita.");

  const revealedPage = await fetch(`${baseUrl}/respostas/${responseId}?identificacao=mostrar`, { headers: { cookie: adminCookie } });
  const revealedHtml = await revealedPage.text();
  assert(revealedPage.status === 200 && revealedHtml.includes(knownName) && revealedHtml.includes(knownContact), "A identificação autorizada não foi revelada.");

  const auditRows = await client.query("SELECT id FROM audit_logs WHERE action = 'RESPONSE_IDENTITY_VIEWED' AND entity_type = 'response' AND entity_id = $1", [responseId]);
  assert(auditRows.rowCount >= 1, "A revelação da identificação não foi registrada na auditoria.");

  console.log("E2E aprovado: listagem por escopo, detalhe protegido, revelação autorizada e auditoria.");
} finally {
  await cleanup();
  await client.end();
}
