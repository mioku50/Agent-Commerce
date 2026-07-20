import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAddress, isAddress, type Address } from "viem";
import { getByoaConfig } from "./config.ts";
import { BYOA_SCOPES, type ByoaScope } from "./types.ts";

export const BYOA_OWNER_SESSION_COOKIE = "byoa_owner_session";

type OwnerSessionPayload = {
  v: 1;
  wallet: Address;
  iat: number;
  exp: number;
  nonce: string;
};

function hmac(secret: string, purpose: string, value: string) {
  return createHmac("sha256", secret).update(`${purpose}\n${value}`).digest("hex");
}

function equalHex(left: string, right: string) {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function createOwnerSession(wallet: Address, now = Date.now()) {
  const config = getByoaConfig();
  const payload: OwnerSessionPayload = {
    v: 1,
    wallet: getAddress(wallet),
    iat: Math.floor(now / 1_000),
    exp: Math.floor(now / 1_000) + config.sessionTtlSeconds,
    nonce: randomBytes(12).toString("hex"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = hmac(config.managementSessionSecret, "byoa-owner-session-v1", encoded);
  return { value: `${encoded}.${signature}`, payload };
}

export function verifyOwnerSession(value: string | undefined | null, now = Date.now()) {
  if (!value) return null;
  const [encoded, signature, extra] = value.split(".");
  if (!encoded || !signature || extra) return null;
  const config = getByoaConfig();
  const expected = hmac(config.managementSessionSecret, "byoa-owner-session-v1", encoded);
  if (!equalHex(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OwnerSessionPayload;
    if (payload.v !== 1 || !isAddress(payload.wallet) || payload.exp <= Math.floor(now / 1_000)) return null;
    return { ...payload, wallet: getAddress(payload.wallet) };
  } catch {
    return null;
  }
}

export function createApiCredential(agentPublicId: string) {
  const prefix = `aac_${randomBytes(4).toString("hex")}`;
  const token = `${prefix}.${agentPublicId}.${randomBytes(32).toString("base64url")}`;
  return { token, prefix, hash: hashApiCredential(token) };
}

export function hashApiCredential(token: string) {
  const config = getByoaConfig();
  return hmac(config.credentialPepper, "byoa-api-credential-v1", token);
}

export function bearerToken(header: string | null) {
  const match = header?.match(/^Bearer\s+([^\s]{40,300})$/i);
  if (!match) throw new Error("A BYOA Bearer credential is required.");
  return match[1];
}

export function normalizeScopes(value: unknown): ByoaScope[] {
  if (!Array.isArray(value)) throw new Error("Credential scopes must be an array.");
  const scopes = [...new Set(value.map((scope) => String(scope).trim()))];
  if (scopes.length === 0 || scopes.some((scope) => !BYOA_SCOPES.includes(scope as ByoaScope))) {
    throw new Error("Credential scopes contain an unsupported value.");
  }
  return scopes as ByoaScope[];
}

export function credentialExpiry(value: unknown, now = Date.now()) {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  const maximum = now + 90 * 24 * 60 * 60 * 1_000;
  if (!Number.isFinite(parsed) || parsed <= now + 60_000 || parsed > maximum) {
    throw new Error("Credential expiry must be between 1 minute and 90 days from now.");
  }
  return new Date(parsed).toISOString();
}
