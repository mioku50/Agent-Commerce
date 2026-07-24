/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { tryGetServerSupabaseConfig } from "../supabase/server-env.ts";

export interface IdempotencyCheckResult<T = unknown> {
  ok: boolean;
  conflict: boolean;
  cachedResponse?: {
    status: number;
    body: T;
  } | null;
  cached: boolean;
  result?: T;
}

export interface ResolveMachineIdempotencyOptions {
  key: string;
  credentialId: string;
  agentId?: string;
  route?: string;
  payload: unknown;
}

export interface SaveMachineIdempotencyOptions {
  key: string;
  credentialId: string;
  agentId?: string;
  route?: string;
  payload: unknown;
  responseStatus?: number;
  responseBody: unknown;
  resourceType?: string;
  resourceId?: string;
}

interface MemoryStoredRecord {
  key: string;
  credentialId: string;
  agentId: string;
  route: string;
  keyHash: string;
  requestHash: string;
  responseStatus?: number;
  responseBody?: unknown;
  resourceType?: string;
  resourceId?: string;
  createdAt: number;
}

const memoryStore = new Map<string, MemoryStoredRecord>();
const MAX_STORE_SIZE = 1000;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let customClient: SupabaseClient | null = null;

export function setMachineIdempotencyClientForTesting(
  client: SupabaseClient | null,
): void {
  customClient = client;
}

function getSupabaseClient(): SupabaseClient | null {
  if (customClient) return customClient;
  const config = tryGetServerSupabaseConfig();
  if (!config) return null;
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function canonicalizeJson(val: unknown): string {
  if (val === undefined) return "null";
  if (val === null || typeof val !== "object") {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return `[${val.map((item) => canonicalizeJson(item)).join(",")}]`;
  }
  const obj = val as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys.map(
    (key) => `${JSON.stringify(key)}:${canonicalizeJson(obj[key])}`,
  );
  return `{${entries.join(",")}}`;
}

export function computeCanonicalRequestHash(payload: unknown): string {
  const json = canonicalizeJson(payload ?? {});
  return createHash("sha256").update(json).digest("hex");
}

export function computePayloadHash(payload: unknown): string {
  return computeCanonicalRequestHash(payload);
}

export function buildIdempotencyCompositeKey(
  key: string,
  credentialId: string,
  route = "/api/agent/v1",
): string {
  const keyHash = createHash("sha256").update(key.trim()).digest("hex");
  return `${credentialId}:${route}:${keyHash}`;
}

export async function resolveMachineIdempotency<T = unknown>(
  keyOrOptions: string | ResolveMachineIdempotencyOptions,
  credentialIdArg?: string,
  payloadArg?: unknown,
  routeArg = "/api/agent/v1",
  agentIdArg?: string,
): Promise<IdempotencyCheckResult<T>> {
  let key: string;
  let credentialId: string;
  let agentId: string;
  let route: string;
  let payload: unknown;

  if (typeof keyOrOptions === "object" && keyOrOptions !== null) {
    key = keyOrOptions.key;
    credentialId = keyOrOptions.credentialId;
    agentId = keyOrOptions.agentId || keyOrOptions.credentialId;
    route = keyOrOptions.route || "/api/agent/v1";
    payload = keyOrOptions.payload;
  } else {
    key = keyOrOptions;
    credentialId = credentialIdArg!;
    agentId = agentIdArg || credentialIdArg!;
    route = routeArg;
    payload = payloadArg;
  }

  if (!key || !key.trim()) {
    return {
      ok: true,
      conflict: false,
      cached: false,
      cachedResponse: null,
      result: undefined,
    };
  }

  const idempotencyKeyHash = createHash("sha256").update(key.trim()).digest("hex");
  const requestHash = computeCanonicalRequestHash(payload);
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data: existing, error: selectError } = await supabase
        .from("machine_api_idempotency")
        .select("*")
        .eq("credential_id", credentialId)
        .eq("route", route)
        .eq("idempotency_key_hash", idempotencyKeyHash)
        .maybeSingle();

      if (!selectError && existing) {
        if (new Date(existing.expires_at).getTime() > Date.now()) {
          if (existing.request_hash !== requestHash) {
            return {
              ok: false,
              conflict: true,
              cached: false,
              cachedResponse: null,
              result: undefined,
            };
          }
          if (
            existing.response_status !== null &&
            existing.response_status !== undefined
          ) {
            return {
              ok: true,
              conflict: false,
              cached: true,
              cachedResponse: {
                status: existing.response_status,
                body: existing.response_body as T,
              },
              result: existing.response_body as T,
            };
          }
          return {
            ok: true,
            conflict: false,
            cached: false,
            cachedResponse: null,
            result: undefined,
          };
        }
      }

      const { error: insertError } = await supabase
        .from("machine_api_idempotency")
        .insert({
          credential_id: credentialId,
          agent_id: agentId,
          route: route,
          idempotency_key_hash: idempotencyKeyHash,
          request_hash: requestHash,
          expires_at: expiresAt,
        });

      if (insertError) {
        const { data: retryRecord } = await supabase
          .from("machine_api_idempotency")
          .select("*")
          .eq("credential_id", credentialId)
          .eq("route", route)
          .eq("idempotency_key_hash", idempotencyKeyHash)
          .maybeSingle();

        if (
          retryRecord &&
          new Date(retryRecord.expires_at).getTime() > Date.now()
        ) {
          if (retryRecord.request_hash !== requestHash) {
            return {
              ok: false,
              conflict: true,
              cached: false,
              cachedResponse: null,
              result: undefined,
            };
          }
          if (
            retryRecord.response_status !== null &&
            retryRecord.response_status !== undefined
          ) {
            return {
              ok: true,
              conflict: false,
              cached: true,
              cachedResponse: {
                status: retryRecord.response_status,
                body: retryRecord.response_body as T,
              },
              result: retryRecord.response_body as T,
            };
          }
        }
      }

      return {
        ok: true,
        conflict: false,
        cached: false,
        cachedResponse: null,
        result: undefined,
      };
    } catch (err) {
      console.warn(
        "[machine-idempotency] DB lookup error, falling back to memory store:",
        err,
      );
    }
  }

  const compositeKey = `${credentialId}:${route}:${idempotencyKeyHash}`;
  const existing = memoryStore.get(compositeKey);

  if (existing) {
    if (Date.now() - existing.createdAt > TTL_MS) {
      memoryStore.delete(compositeKey);
    } else {
      if (existing.requestHash !== requestHash) {
        return {
          ok: false,
          conflict: true,
          cached: false,
          cachedResponse: null,
          result: undefined,
        };
      }
      if (
        existing.responseStatus !== undefined &&
        existing.responseStatus !== null
      ) {
        return {
          ok: true,
          conflict: false,
          cached: true,
          cachedResponse: {
            status: existing.responseStatus,
            body: existing.responseBody as T,
          },
          result: existing.responseBody as T,
        };
      }
      return {
        ok: true,
        conflict: false,
        cached: false,
        cachedResponse: null,
        result: undefined,
      };
    }
  }

  if (memoryStore.size >= MAX_STORE_SIZE) {
    const oldestKey = memoryStore.keys().next().value;
    if (oldestKey) memoryStore.delete(oldestKey);
  }

  memoryStore.set(compositeKey, {
    key: key.trim(),
    credentialId,
    agentId,
    route,
    keyHash: idempotencyKeyHash,
    requestHash,
    responseStatus: undefined,
    responseBody: undefined,
    createdAt: Date.now(),
  });

  return {
    ok: true,
    conflict: false,
    cached: false,
    cachedResponse: null,
    result: undefined,
  };
}

export async function saveMachineIdempotency<T = unknown>(
  keyOrOptions: string | SaveMachineIdempotencyOptions,
  credentialIdArg?: string,
  payloadArg?: unknown,
  resultArg?: T,
  optionsArg?: {
    agentId?: string;
    route?: string;
    responseStatus?: number;
    resourceType?: string;
    resourceId?: string;
  },
): Promise<void> {
  let key: string;
  let credentialId: string;
  let agentId: string;
  let route: string;
  let payload: unknown;
  let responseStatus: number;
  let responseBody: unknown;
  let resourceType: string | undefined;
  let resourceId: string | undefined;

  if (typeof keyOrOptions === "object" && keyOrOptions !== null) {
    key = keyOrOptions.key;
    credentialId = keyOrOptions.credentialId;
    agentId = keyOrOptions.agentId || keyOrOptions.credentialId;
    route = keyOrOptions.route || "/api/agent/v1";
    payload = keyOrOptions.payload;
    responseStatus = keyOrOptions.responseStatus ?? 200;
    responseBody = keyOrOptions.responseBody;
    resourceType = keyOrOptions.resourceType;
    resourceId = keyOrOptions.resourceId;
  } else {
    key = keyOrOptions;
    credentialId = credentialIdArg!;
    agentId = optionsArg?.agentId || credentialIdArg!;
    route = optionsArg?.route || "/api/agent/v1";
    payload = payloadArg;
    responseStatus = optionsArg?.responseStatus ?? 200;
    responseBody = resultArg;
    resourceType = optionsArg?.resourceType;
    resourceId = optionsArg?.resourceId;
  }

  if (!key || !key.trim()) return;

  const idempotencyKeyHash = createHash("sha256").update(key.trim()).digest("hex");
  const requestHash = computeCanonicalRequestHash(payload);
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { error } = await supabase.from("machine_api_idempotency").upsert(
        {
          credential_id: credentialId,
          agent_id: agentId,
          route: route,
          idempotency_key_hash: idempotencyKeyHash,
          request_hash: requestHash,
          response_status: responseStatus,
          response_body: responseBody as any,
          resource_type: resourceType || null,
          resource_id: resourceId || null,
          expires_at: expiresAt,
        },
        {
          onConflict: "credential_id,route,idempotency_key_hash",
        },
      );
      if (!error) return;
      console.warn(
        "[machine-idempotency] DB upsert error, falling back to memory store:",
        error,
      );
    } catch (err) {
      console.warn(
        "[machine-idempotency] DB upsert failed, falling back to memory store:",
        err,
      );
    }
  }

  const compositeKey = `${credentialId}:${route}:${idempotencyKeyHash}`;
  const existing = memoryStore.get(compositeKey);
  memoryStore.set(compositeKey, {
    key: key.trim(),
    credentialId,
    agentId,
    route,
    keyHash: idempotencyKeyHash,
    requestHash,
    responseStatus,
    responseBody,
    resourceType,
    resourceId,
    createdAt: existing?.createdAt || Date.now(),
  });
}

export function clearMachineIdempotencyStore(): void {
  memoryStore.clear();
}
