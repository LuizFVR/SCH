import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const MAX_MEMORY = 64 * 1024 * 1024;

function derivePassword(password: string, salt: Buffer, cost = COST, blockSize = BLOCK_SIZE, parallelization = PARALLELIZATION) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: cost, r: blockSize, p: parallelization, maxmem: MAX_MEMORY }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey as Buffer);
    });
  });
}

export async function hashPassword(password: string) {
  if (password.length < 12) throw new Error("A senha precisa ter pelo menos 12 caracteres.");

  const salt = randomBytes(16);
  const derivedKey = await derivePassword(password, salt);
  return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password: string, encodedHash: string) {
  const [algorithm, costValue, blockSizeValue, parallelizationValue, saltValue, hashValue] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;

  const cost = Number(costValue);
  const blockSize = Number(blockSizeValue);
  const parallelization = Number(parallelizationValue);
  if (cost !== COST || blockSize !== BLOCK_SIZE || parallelization !== PARALLELIZATION) return false;

  try {
    const expected = Buffer.from(hashValue, "base64url");
    const actual = await derivePassword(password, Buffer.from(saltValue, "base64url"), cost, blockSize, parallelization);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export async function consumePasswordVerificationCost(password: string) {
  await derivePassword(password, Buffer.from("voz-paciente-login", "utf8"));
}
