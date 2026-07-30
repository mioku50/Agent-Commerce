import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const PREFIX = "vwh:v1";

function key() {
  const configured =
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY?.trim() ||
    process.env.SELLER_ENDPOINT_ENCRYPTION_KEY?.trim();
  if (!configured) {
    throw new Error("Webhook secret encryption is not configured.");
  }
  return createHash("sha256")
    .update(`veyra-webhook-secret-v1\n${configured}`, "utf8")
    .digest();
}

export function createWebhookSecret() {
  return `vwhsec_${randomBytes(32).toString("base64url")}`;
}

export function encryptWebhookSecret(secret: string) {
  if (!/^vwhsec_[A-Za-z0-9_-]{40,60}$/.test(secret)) {
    throw new Error("Webhook secret is invalid.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [
    PREFIX,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptWebhookSecret(encrypted: string) {
  const [prefix, version, iv, tag, ciphertext, extra] = encrypted.split(":");
  if (`${prefix}:${version}` !== PREFIX || !iv || !tag || !ciphertext || extra) {
    throw new Error("Stored webhook secret is invalid.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
