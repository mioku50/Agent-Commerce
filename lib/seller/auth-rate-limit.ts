import { createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSellerSessionSecret } from "./session.ts";
import { getServerSupabaseConfig } from "../supabase/server-env.ts";

const MAX_FAILURES = 5;
const LOCKOUT_SECONDS = 15 * 60;

type AttemptResult = {
  allowed: boolean;
  locked: boolean;
  retryAfterSeconds: number;
};

type RpcRow = {
  allowed: boolean;
  locked: boolean;
  retry_after_seconds: number;
};

const memoryAttempts = new Map<string, { failures: number; lockedUntil: number }>();
let supabase: SupabaseClient | null = null;

function getClient() {
  const config = getServerSupabaseConfig();
  supabase ??= createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabase;
}

function requestAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function sellerLoginFingerprint(request: Request) {
  return createHmac("sha256", getSellerSessionSecret())
    .update(`seller-login:${requestAddress(request)}`)
    .digest("hex");
}

function consumeMemoryAttempt(identifier: string, passwordValid: boolean): AttemptResult {
  const now = Date.now();
  const existing = memoryAttempts.get(identifier);
  if (existing && existing.lockedUntil > now) {
    return {
      allowed: false,
      locked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.lockedUntil - now) / 1000)),
    };
  }
  if (passwordValid) {
    memoryAttempts.delete(identifier);
    return { allowed: true, locked: false, retryAfterSeconds: 0 };
  }
  const failures = (existing?.failures ?? 0) + 1;
  const lockedUntil = failures >= MAX_FAILURES ? now + LOCKOUT_SECONDS * 1000 : 0;
  memoryAttempts.set(identifier, { failures, lockedUntil });
  return {
    allowed: false,
    locked: lockedUntil > 0,
    retryAfterSeconds: lockedUntil > 0 ? LOCKOUT_SECONDS : 0,
  };
}

export async function consumeSellerLoginAttempt(
  request: Request,
  passwordValid: boolean,
): Promise<AttemptResult> {
  const identifier = sellerLoginFingerprint(request);
  if (process.env.NODE_ENV === "test") {
    return consumeMemoryAttempt(identifier, passwordValid);
  }

  const { data, error } = await getClient().rpc("consume_seller_auth_attempt", {
    p_identifier: identifier,
    p_password_valid: passwordValid,
    p_max_failures: MAX_FAILURES,
    p_lockout_seconds: LOCKOUT_SECONDS,
  });
  if (error) throw new Error(`Seller authentication rate limiter unavailable: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as RpcRow | null;
  if (!row) throw new Error("Seller authentication rate limiter returned no decision.");
  return {
    allowed: row.allowed,
    locked: row.locked,
    retryAfterSeconds: Math.max(0, Number(row.retry_after_seconds) || 0),
  };
}

export function resetSellerLoginRateLimitForTests() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Seller login limiter can only be reset in tests.");
  }
  memoryAttempts.clear();
}
