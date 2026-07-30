/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from "@supabase/supabase-js";
import { tryGetServerSupabaseConfig } from "../supabase/server-env.ts";
import type {
  ApiQualityObservation,
  ApiQualityObservationInput,
  ApiQualityObservationRow,
} from "./api-quality-types.ts";

const inMemoryObservations: ApiQualityObservation[] = [];

/**
 * Converts a database row to the canonical ApiQualityObservation object.
 */
export function rowToObservation(
  row: ApiQualityObservationRow,
): ApiQualityObservation {
  return {
    observationId: row.observation_id,
    serviceId: row.service_id,
    sellerPublicId: row.seller_public_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    quotedPriceUsdc:
      typeof row.quoted_price_usdc === "number"
        ? row.quoted_price_usdc
        : parseFloat(String(row.quoted_price_usdc || "0")),
    paidAmountUsdc:
      typeof row.paid_amount_usdc === "number"
        ? row.paid_amount_usdc
        : parseFloat(String(row.paid_amount_usdc || "0")),
    latencyMs:
      typeof row.latency_ms === "number"
        ? row.latency_ms
        : parseInt(String(row.latency_ms || "0"), 10),
    httpStatusClass: row.http_status_class,
    endpointReached: Boolean(row.endpoint_reached),
    responseSchemaValid: Boolean(row.response_schema_valid),
    responseWithinSizeLimit: Boolean(row.response_within_size_limit),
    paymentRequired: Boolean(row.payment_required),
    paymentAuthorized: Boolean(row.payment_authorized),
    paymentSettled: Boolean(row.payment_settled),
    executionCompleted: Boolean(row.execution_completed),
    arcProofVerified: Boolean(row.arc_proof_verified),
    errorCategory: row.error_category,
    source: row.source,
    createdAt: row.created_at,
  };
}

/**
 * Converts an observation input or object to a database row insert object.
 */
export function observationToRowInput(
  obs: ApiQualityObservation,
): ApiQualityObservationRow {
  return {
    observation_id: obs.observationId,
    service_id: obs.serviceId,
    seller_public_id: obs.sellerPublicId ?? null,
    started_at: obs.startedAt,
    completed_at: obs.completedAt,
    quoted_price_usdc: obs.quotedPriceUsdc,
    paid_amount_usdc: obs.paidAmountUsdc,
    latency_ms: obs.latencyMs,
    http_status_class: obs.httpStatusClass,
    endpoint_reached: obs.endpointReached,
    response_schema_valid: obs.responseSchemaValid,
    response_within_size_limit: obs.responseWithinSizeLimit,
    payment_required: obs.paymentRequired,
    payment_authorized: obs.paymentAuthorized,
    payment_settled: obs.paymentSettled,
    execution_completed: obs.executionCompleted,
    arc_proof_verified: obs.arcProofVerified,
    error_category: obs.errorCategory,
    source: obs.source,
    created_at: obs.createdAt,
  };
}

/**
 * Records a new API quality observation into database and/or in-memory store.
 */
export async function recordApiQualityObservation(
  input: ApiQualityObservationInput,
): Promise<ApiQualityObservation> {
  const nowIso = new Date().toISOString();
  const observationId =
    input.observationId ||
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `obs_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
  const createdAt = input.createdAt || nowIso;

  const observation: ApiQualityObservation = {
    ...input,
    observationId,
    sellerPublicId: input.sellerPublicId ?? null,
    createdAt,
  };

  // Always append to in-memory store for fallback / rapid querying / tests
  inMemoryObservations.push(observation);

  // Attempt database persistence if configured
  const serverConfig = tryGetServerSupabaseConfig();
  if (serverConfig) {
    try {
      const client = createClient(serverConfig.url, serverConfig.key);
      const row = observationToRowInput(observation);
      const { error } = await client
        .from("api_quality_observations")
        .insert(row);
      if (error) {
        console.warn(
          `[recordApiQualityObservation] Supabase insert warning: ${error.message}`,
        );
      }
    } catch (dbErr) {
      console.warn(
        `[recordApiQualityObservation] Database write failed: ${
          dbErr instanceof Error ? dbErr.message : String(dbErr)
        }`,
      );
    }
  }

  return observation;
}

/**
 * Fetches API quality observations for a single service within a window of days.
 */
export async function fetchApiQualityObservations(
  serviceId: string,
  windowDays: number = 30,
): Promise<ApiQualityObservation[]> {
  const windowMs = Math.max(1, windowDays) * 86400 * 1000;
  const cutoffIso = new Date(Date.now() - windowMs).toISOString();

  const serverConfig = tryGetServerSupabaseConfig();
  if (serverConfig) {
    try {
      const client = createClient(serverConfig.url, serverConfig.key);
      const { data, error } = await client
        .from("api_quality_observations")
        .select("*")
        .eq("service_id", serviceId)
        .gte("started_at", cutoffIso)
        .order("started_at", { ascending: false });

      if (!error && Array.isArray(data) && data.length > 0) {
        return (data as ApiQualityObservationRow[]).map(rowToObservation);
      }
    } catch (dbErr) {
      console.warn(
        `[fetchApiQualityObservations] Supabase query warning: ${
          dbErr instanceof Error ? dbErr.message : String(dbErr)
        }`,
      );
    }
  }

  // Fallback to in-memory observations matching criteria
  return inMemoryObservations
    .filter(
      (obs) => obs.serviceId === serviceId && obs.startedAt >= cutoffIso,
    )
    .sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
}

/**
 * Fetches API quality observations for multiple services within a window of days.
 */
export async function fetchApiQualityObservationsForServices(
  serviceIds: string[],
  windowDays: number = 30,
): Promise<Record<string, ApiQualityObservation[]>> {
  const results: Record<string, ApiQualityObservation[]> = {};
  const uniqueServiceIds = Array.from(new Set(serviceIds.filter(Boolean)));

  const windowMs = Math.max(1, windowDays) * 86400 * 1000;
  const cutoffIso = new Date(Date.now() - windowMs).toISOString();

  const serverConfig = tryGetServerSupabaseConfig();
  if (serverConfig && uniqueServiceIds.length > 0) {
    try {
      const client = createClient(serverConfig.url, serverConfig.key);
      const { data, error } = await client
        .from("api_quality_observations")
        .select("*")
        .in("service_id", uniqueServiceIds)
        .gte("started_at", cutoffIso)
        .order("started_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        for (const id of uniqueServiceIds) {
          results[id] = [];
        }
        for (const row of data as ApiQualityObservationRow[]) {
          const obs = rowToObservation(row);
          if (!results[obs.serviceId]) {
            results[obs.serviceId] = [];
          }
          results[obs.serviceId].push(obs);
        }
        return results;
      }
    } catch (dbErr) {
      console.warn(
        `[fetchApiQualityObservationsForServices] Supabase query warning: ${
          dbErr instanceof Error ? dbErr.message : String(dbErr)
        }`,
      );
    }
  }

  // In-memory fallback
  for (const id of uniqueServiceIds) {
    results[id] = inMemoryObservations
      .filter((obs) => obs.serviceId === id && obs.startedAt >= cutoffIso)
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      );
  }

  return results;
}

/**
 * Resets the in-memory observations cache (primarily for unit tests).
 */
export function clearInMemoryApiQualityObservations(): void {
  inMemoryObservations.length = 0;
}

/**
 * Returns current in-memory observations.
 */
export function getInMemoryApiQualityObservations(): ApiQualityObservation[] {
  return [...inMemoryObservations];
}
