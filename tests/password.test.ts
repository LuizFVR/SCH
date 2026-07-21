import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../lib/password.ts";

test("gera um hash e valida somente a senha correta", async () => {
  const hash = await hashPassword("SenhaForteDeTeste123!");

  assert.equal(await verifyPassword("SenhaForteDeTeste123!", hash), true);
  assert.equal(await verifyPassword("SenhaIncorreta123!", hash), false);
  assert.equal(hash.includes("SenhaForteDeTeste123!"), false);
});

test("recusa senhas iniciais com menos de 12 caracteres", async () => {
  await assert.rejects(() => hashPassword("curta"));
});
