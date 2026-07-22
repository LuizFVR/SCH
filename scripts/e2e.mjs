import pg from "pg";

const { Client } = pg;
const baseUrl = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const databaseUrl = process.env.DATABASE_URL;
const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;

if (!databaseUrl || !adminEmail || !adminPassword) {
  throw new Error("Defina DATABASE_URL e INITIAL_ADMIN_EMAIL/INITIAL_ADMIN_PASSWORD para o teste integrado.");
}

const applicationHost = new URL(baseUrl).hostname;
const databaseHost = new URL(databaseUrl).hostname;
if (!['localhost', '127.0.0.1'].includes(applicationHost) || !['localhost', '127.0.0.1'].includes(databaseHost)) {
  throw new Error("O teste integrado só pode ser executado contra a aplicação e o banco locais.");
}

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
  const sectors = await client.query("SELECT s.id FROM sectors s JOIN units u ON u.id = s.unit_id WHERE s.name = 'Fisioterapia' ORDER BY u.name LIMIT 2");
  assert(sectors.rowCount === 2, "O seed precisa conter os dois setores de Fisioterapia.");

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
      name: `[E2E] Validação ${Date.now()}`,
      description: "Pesquisa temporária do teste integrado.",
      questions: [
        { clientId: "e2e-score-1", title: "Como você avalia o atendimento?", type: "STARS", required: true, options: [] },
        { clientId: "e2e-score-2", title: "Como você avalia a clareza?", type: "STARS", required: true, options: [] },
        { clientId: "e2e-comment", title: "O que podemos melhorar?", type: "LONG_TEXT", required: false, options: [] },
      ],
      sectorIds: sectors.rows.map((row) => row.id),
      identificationMode: "OPTIONAL",
      identificationFields: ["name", "contact", "age", "sex"],
      alertThreshold: 2,
      duplicateWindowHours: 12,
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
    ORDER BY pt.created_at, sq.position
  `, [surveyId]);
  assert(publicationRows.rowCount === 6, "A publicação deveria gerar dois QR Codes com três perguntas cada.");
  sourceQuestionIds = [...new Set(publicationRows.rows.map((row) => row.source_question_id).filter(Boolean))];
  const token = publicationRows.rows[0].public_token;
  const questions = publicationRows.rows.filter((row) => row.public_token === token);

  const publicPage = await fetch(`${baseUrl}/responder/${token}`);
  assert(publicPage.status === 200, `Página pública retornou HTTP ${publicPage.status}.`);
  const qrCode = await fetch(`${baseUrl}/api/qr/${token}`);
  assert(qrCode.status === 200 && qrCode.headers.get("content-type") === "image/png", "O QR Code não foi gerado como PNG.");

  const answerPayload = {
    answers: questions.map((question) => ({ questionId: question.question_id, value: question.type === "STARS" ? 1 : "Teste integrado de comentário." })),
    identity: { name: "Paciente E2E", contact: "e2e@local.invalid", age: "30 a 44 anos", sex: "Prefiro não informar", consent: true },
  };
  const answerResponse = await fetch(`${baseUrl}/api/public/responses/${token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(answerPayload),
  });
  const answered = await answerResponse.json();
  assert(answerResponse.status === 201 && answered.responseId, `Resposta pública falhou: ${answered.error ?? answerResponse.status}`);
  const deviceCookie = cookieFrom(answerResponse);
  assert(deviceCookie, "A resposta não criou a proteção de duplicidade do aparelho.");

  const duplicateResponse = await fetch(`${baseUrl}/api/public/responses/${token}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: deviceCookie },
    body: JSON.stringify(answerPayload),
  });
  assert(duplicateResponse.status === 409, `A resposta duplicada deveria retornar HTTP 409, mas retornou ${duplicateResponse.status}.`);

  const verification = await client.query(`
    SELECT r.overall_score, r.identified, ri.name_ciphertext, a.status AS alert_status
    FROM responses r
    JOIN response_identities ri ON ri.response_id = r.id
    JOIN alerts a ON a.response_id = r.id
    WHERE r.id = $1
  `, [answered.responseId]);
  const result = verification.rows[0];
  assert(result?.overall_score === 1, "A nota geral da resposta não foi calculada corretamente.");
  assert(result?.identified === true && result.name_ciphertext && !result.name_ciphertext.includes("Paciente E2E"), "A identificação não foi criptografada.");
  assert(result?.alert_status === "NEW", "A nota baixa não gerou um alerta novo.");

  console.log("E2E aprovado: login, publicação, 2 QR Codes, resposta criptografada, bloqueio de duplicidade e alerta.");
} finally {
  await cleanup();
  await client.end();
}
