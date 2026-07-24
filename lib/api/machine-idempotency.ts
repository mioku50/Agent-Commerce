/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from "node:crypto";

export interface IdempotencyCheckResult<T = unknown> {
  cached: boolean;
  conflict: boolean;
  result?: T;
}

interface StoredRecord {
  key: string;
  credentialId: string;
  payloadHash: string;
  result: unknown;
  createdAt: number;
}

const memoryStore = new Map<string, StoredRecord>();
const MAX_STORE_SIZE = 1000;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function computePayloadHash(payload: unknown): string {
  const json = JSON.stringify(payload ?? {});
  return createHash("sha256").update(json).digest("hex");
}

export function buildIdempotencyCompositeKey(
  key: string,
  credentialId: string,
): string {
  return `${credentialId}:${key.trim()}`;
}

export function resolveMachineIdempotency<T = unknown>(
  key: string,
  credentialId: string,
  payload: unknown,
): IdempotencyCheckResult<T> {
  if (!key || !key.trim()) {
    return { cached: false, conflict: false };
  }

  const compositeKey = buildIdempotencyCompositeKey(key, credentialId);
  const payloadHash = computePayloadHash(payload);

  const existing = memoryStore.get(compositeKey);
  if (!existing) {
    return { cached: false, conflict: false };
  }

  // Check TTL
  if (Date.now() - existing.createdAt > TTL_MS) {
    memoryStore.delete(compositeKey);
    return { cached: false, conflict: false };
  }

  if (existing.payloadHash !== payloadHash) {
    return { cached: false, conflict: true };
  }

  return {
    cached: true,
    conflict: false,
    result: existing.result as T,
  };
}

export function saveMachineIdempotency<T = unknown>(
  key: string,
  credentialId: string,
  payload: unknown,
  result: T,
): void {
  if (!key || !key.trim()) return;

  const compositeKey = buildIdempotencyCompositeKey(key, credentialId);
  const payloadHash = computePayloadHash(payload);

  // Evict old entries if store exceeds max capacity
  if (memoryStore.size >= MAX_STORE_SIZE) {
    const oldestKey = memoryStore.keys().next().value;
    if (oldestKey) memoryStore.delete(oldestKey);
  }

  memoryStore.set(compositeKey, {
    key: key.trim(),
    credentialId,
    payloadHash,
    result,
    createdAt: Date.now(),
  });
}

export function clearMachineIdempotencyStore(): void {
  memoryStore.clear();
}
