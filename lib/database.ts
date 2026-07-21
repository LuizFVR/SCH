import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";

type Database = NodePgDatabase<typeof schema>;

const globalDatabase = globalThis as typeof globalThis & {
  vozPacientePool?: Pool;
  vozPacienteDatabase?: Database;
};

export function getDatabase(): Database {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL não foi configurada.");
  }

  if (!globalDatabase.vozPacientePool) {
    globalDatabase.vozPacientePool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  if (!globalDatabase.vozPacienteDatabase) {
    globalDatabase.vozPacienteDatabase = drizzle({ client: globalDatabase.vozPacientePool, schema });
  }

  return globalDatabase.vozPacienteDatabase;
}

export function isDemoMode() {
  return process.env.AUTH_DEMO_MODE === "true" && process.env.NODE_ENV !== "production";
}
