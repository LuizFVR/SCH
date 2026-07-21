import { randomBytes, scrypt } from "node:crypto";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
const adminName = process.env.INITIAL_ADMIN_NAME;
const adminEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLocaleLowerCase("pt-BR");
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;

if (!connectionString || !adminName || !adminEmail || !adminPassword || adminPassword.length < 12) {
  throw new Error("Defina DATABASE_URL e as variáveis INITIAL_ADMIN_*; a senha precisa ter ao menos 12 caracteres.");
}

function derivePassword(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derivedKey) => error ? reject(error) : resolve(derivedKey));
  });
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await derivePassword(password, salt);
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

const client = new Client({ connectionString });
await client.connect();

try {
  await client.query("BEGIN");

  let hospital = (await client.query("SELECT id FROM hospitals WHERE name = $1 LIMIT 1", ["Hospital principal"])).rows[0];
  if (!hospital) hospital = (await client.query("INSERT INTO hospitals (name) VALUES ($1) RETURNING id", ["Hospital principal"])).rows[0];

  const serviceNames = ["Fisioterapia", "Recepção", "Pronto atendimento", "Reabilitação"];
  const serviceIds = new Map();
  for (const name of serviceNames) {
    const result = await client.query("INSERT INTO service_types (hospital_id, name) VALUES ($1, $2) ON CONFLICT (hospital_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id", [hospital.id, name]);
    serviceIds.set(name, result.rows[0].id);
  }

  const unitDefinitions = [
    { name: "Unidade Urgência", sectors: ["Fisioterapia", "Recepção", "Pronto atendimento"] },
    { name: "Unidade Cendor", sectors: ["Fisioterapia", "Reabilitação", "Recepção"] },
  ];

  for (const unitDefinition of unitDefinitions) {
    const unitResult = await client.query("INSERT INTO units (hospital_id, name) VALUES ($1, $2) ON CONFLICT (hospital_id, name) DO UPDATE SET active = true RETURNING id", [hospital.id, unitDefinition.name]);
    for (const sectorName of unitDefinition.sectors) {
      await client.query("INSERT INTO sectors (unit_id, service_type_id, name) VALUES ($1, $2, $3) ON CONFLICT (unit_id, name) DO UPDATE SET service_type_id = EXCLUDED.service_type_id, active = true", [unitResult.rows[0].id, serviceIds.get(sectorName), sectorName]);
    }
  }

  const existingAdmin = await client.query("SELECT id FROM users WHERE hospital_id = $1 AND email = $2 LIMIT 1", [hospital.id, adminEmail]);
  if (existingAdmin.rowCount === 0) {
    const passwordHash = await hashPassword(adminPassword);
    await client.query("INSERT INTO users (hospital_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, 'ADMIN')", [hospital.id, adminName, adminEmail, passwordHash]);
  }

  await client.query("COMMIT");
  console.log(`Estrutura inicial criada. Administrador: ${adminEmail}`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
