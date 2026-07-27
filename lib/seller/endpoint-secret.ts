import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1";

function encryptionKey() {
  const configured = process.env.SELLER_ENDPOINT_ENCRYPTION_KEY?.trim();
  if (!configured) {
    throw new Error("Seller endpoint secret encryption is not configured.");
  }
  return createHash("sha256").update(configured, "utf8").digest();
}

export function encryptSellerEndpointSecret(secret: string) {
  const normalized = secret.trim();
  if (normalized.length < 8 || normalized.length > 2048) {
    throw new Error("Endpoint authorization secret must contain 8-2048 characters.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptSellerEndpointSecret(encrypted: string) {
  const [prefix, version, ivValue, tagValue, ciphertextValue, extra] = encrypted.split(":");
  if (`${prefix}:${version}` !== PREFIX || !ivValue || !tagValue || !ciphertextValue || extra) {
    throw new Error("Stored seller endpoint credential is invalid.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
