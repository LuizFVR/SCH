import { createDecipheriv, createHash } from "node:crypto";

export function decryptIdentityValue(value: string, secret: string) {
  const [ivPart, tagPart, ciphertextPart, ...unexpected] = value.split(".");
  if (!ivPart || !tagPart || !ciphertextPart || unexpected.length > 0) {
    throw new Error("Formato de identificação criptografada inválido.");
  }

  const key = createHash("sha256").update(secret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
