import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const { Client } = pg;
const baseUrl = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const databaseUrl = process.env.DATABASE_URL;
const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;

if (!databaseUrl || !adminEmail || !adminPassword) {
  throw new Error("Defina DATABASE_URL e o administrador inicial para o teste de auditoria.");
}
if (!["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname) || !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("O teste de auditoria só pode ser executado contra a aplicação e o banco locais.");
}

const client = new Client({ connectionString: databaseUrl });
const auditIds = [];
let temporaryUserId;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cookieFrom(response) {
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

await client.connect();

try {
  const adminRows = await client.query("SELECT id, hospital_id FROM users WHERE lower(email) = lower($1) LIMIT 1", [adminEmail]);
  const admin = adminRows.rows[0];
  assert(admin, "Administrador inicial não encontrado.");

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    body: new URLSearchParams({ email: adminEmail, password: adminPassword, remember: "on" }),
    redirect: "manual",
  });
  assert(loginResponse.status === 303, `Login administrativo retornou HTTP ${loginResponse.status}.`);
  const adminCookie = cookieFrom(loginResponse);
  assert(adminCookie, "O login administrativo não retornou uma sessão.");

  const loginAudit = await client.query("SELECT id FROM audit_logs WHERE actor_id = $1 AND action = 'AUTH_LOGIN' ORDER BY created_at DESC LIMIT 1", [admin.id]);
  if (loginAudit.rows[0]?.id) auditIds.push(loginAudit.rows[0].id);

  const insertedLogs = await client.query(`
    INSERT INTO audit_logs (hospital_id, actor_id, action, entity_type, entity_id, metadata, created_at)
    SELECT $1, $2, 'AUTH_LOGIN', 'USER', $2, '{}'::jsonb, now() - (item || ' seconds')::interval
    FROM generate_series(1, 27) AS item
    RETURNING id
  `, [admin.hospital_id, admin.id]);
  auditIds.push(...insertedLogs.rows.map((row) => row.id));
  const markerLog = await client.query(`
    INSERT INTO audit_logs (hospital_id, actor_id, action, entity_type, entity_id, metadata, created_at)
    VALUES ($1, $2, 'E2E_AUDIT_EVENT', 'test', NULL, '{}'::jsonb, now() - interval '28 seconds')
    RETURNING id
  `, [admin.hospital_id, admin.id]);
  auditIds.push(markerLog.rows[0].id);

  const insertedCount = await client.query("SELECT count(*)::int AS total FROM audit_logs WHERE id = ANY($1::uuid[])", [auditIds]);
  assert(insertedCount.rows[0].total >= 29, "Os eventos temporários de paginação não foram criados.");

  const auditPage = await fetch(`${baseUrl}/auditoria?periodo=7&usuario=${admin.id}`, { headers: { cookie: adminCookie } });
  const auditHtml = await auditPage.text();
  assert(auditPage.status === 200, `Painel de auditoria retornou HTTP ${auditPage.status}.`);
  assert(auditHtml.includes("Acesso ao sistema") && auditHtml.includes("pagina=2"), "Filtros ou paginação da auditoria não foram renderizados.");

  const secondPage = await fetch(`${baseUrl}/auditoria?periodo=7&usuario=${admin.id}&pagina=2`, { headers: { cookie: adminCookie } });
  const secondHtml = await secondPage.text();
  assert(secondPage.status === 200 && secondHtml.includes("E2e audit event"), "A segunda página da auditoria não retornou os eventos esperados.");

  const filteredPage = await fetch(`${baseUrl}/auditoria?periodo=7&acao=AUTH_LOGIN&usuario=${admin.id}`, { headers: { cookie: adminCookie } });
  const filteredHtml = await filteredPage.text();
  assert(filteredPage.status === 200 && filteredHtml.includes("Acesso ao sistema") && !filteredHtml.includes("E2e audit event"), "O filtro por ação não foi aplicado corretamente.");

  const temporaryEmail = `audit-analyst-${Date.now()}@local.invalid`;
  const insertedUser = await client.query(`
    INSERT INTO users (hospital_id, name, email, password_hash, role, active)
    VALUES ($1, 'Analista E2E Auditoria', $2, 'senha-nao-utilizada', 'ANALYST', true)
    RETURNING id
  `, [admin.hospital_id, temporaryEmail]);
  temporaryUserId = insertedUser.rows[0].id;
  const sessionToken = randomBytes(32).toString("base64url");
  await client.query("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')", [temporaryUserId, createHash("sha256").update(sessionToken).digest("hex")]);

  const deniedPage = await fetch(`${baseUrl}/auditoria`, { headers: { cookie: `vp_session=${sessionToken}` }, redirect: "manual" });
  const deniedLocation = deniedPage.headers.get("location");
  assert([303, 307, 308].includes(deniedPage.status) && deniedLocation && new URL(deniedLocation, baseUrl).pathname === "/", "Um perfil não administrador conseguiu acessar a auditoria.");

  console.log("E2E aprovado: filtros, paginação e acesso exclusivo do administrador.");
} finally {
  if (auditIds.length > 0) await client.query("DELETE FROM audit_logs WHERE id = ANY($1::uuid[])", [auditIds]);
  if (temporaryUserId) await client.query("DELETE FROM users WHERE id = $1", [temporaryUserId]);
  await client.end();
}
