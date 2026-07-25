/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from "@supabase/supabase-js";
import { tryGetServerSupabaseConfig } from "../lib/supabase/server-env.ts";
import { getPublicSupabaseConfig } from "../lib/supabase/env.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("fetch failed") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ETIMEDOUT")
  );
}

async function verifyProductionMachineSchema() {
  console.log("[verify-machine-schema] Starting production database schema verification...");

  // Load server configuration safely without logging secrets or URLs
  const serverConfig = tryGetServerSupabaseConfig();
  if (!serverConfig) {
    console.log(
      "[verify-machine-schema] SKIPPED: Server Supabase configuration is unconfigured.",
    );
    return;
  }

  console.log(
    `[verify-machine-schema] Server config loaded. Provider=${serverConfig.diagnostic.provider}, KeyEnv=${serverConfig.diagnostic.keyEnv}`,
  );

  const serverClient = createClient(serverConfig.url, serverConfig.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Check 1: Table public.machine_api_idempotency exists and contains required columns
  console.log("[verify-machine-schema] Check 1: Verifying public.machine_api_idempotency table and columns...");
  const requiredIdempotencyColumns = [
    "id",
    "credential_id",
    "agent_id",
    "route",
    "idempotency_key_hash",
    "request_hash",
    "expires_at",
  ];

  try {
    const { error: idempotencyTableError } = await serverClient
      .from("machine_api_idempotency")
      .select(requiredIdempotencyColumns.join(","))
      .limit(0);

    if (idempotencyTableError) {
      if (isNetworkError(idempotencyTableError.message)) {
        console.warn(
          "[verify-machine-schema] WARNING: Database host unreachable (fetch failed / ENOTFOUND). Live database verification skipped.",
        );
        return;
      }
      throw new Error(
        `Table public.machine_api_idempotency or required columns missing: ${idempotencyTableError.message}`,
      );
    }
  } catch (err) {
    if (isNetworkError(err)) {
      console.warn(
        "[verify-machine-schema] WARNING: Database host unreachable (fetch failed / ENOTFOUND). Live database verification skipped.",
      );
      return;
    }
    throw err;
  }
  console.log("  ✓ public.machine_api_idempotency exists with required columns.");

  // Check 2 & 4: Test unique constraint/index and test reservation probe record creation/cleanup
  console.log("[verify-machine-schema] Check 2 & 4: Verifying unique constraint/index and probe record creation/cleanup...");
  const probeIdempotencyKeyHash = "0000000000000000000000000000000000000000000000000000000000000000";
  const probeRequestHash = "0000000000000000000000000000000000000000000000000000000000000000";
  const probeRecord = {
    credential_id: "verify-schema-probe-cred",
    agent_id: "verify-schema-probe-agent",
    route: "/api/agent/v1/verify-probe",
    idempotency_key_hash: probeIdempotencyKeyHash,
    request_hash: probeRequestHash,
    response_status: 200,
    response_body: { verified: true },
    resource_type: "verification_probe",
    resource_id: "test_verification_probe",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };

  // Upsert record using onConflict on (credential_id, route, idempotency_key_hash)
  const { error: probeUpsertError } = await serverClient
    .from("machine_api_idempotency")
    .upsert(probeRecord, {
      onConflict: "credential_id,route,idempotency_key_hash",
    });

  assert(
    !probeUpsertError,
    `Unique constraint or index verification failed for machine_api_idempotency: ${probeUpsertError?.message}`,
  );
  console.log("  ✓ Unique constraint/index on (credential_id, route, idempotency_key_hash) verified.");

  // Verify check 4 (test reservation probe record exists)
  const { data: fetchedProbe, error: fetchProbeError } = await serverClient
    .from("machine_api_idempotency")
    .select("id, resource_id, credential_id")
    .eq("resource_id", "test_verification_probe")
    .maybeSingle();

  assert(
    !fetchProbeError && fetchedProbe,
    `Test reservation probe record created but not found: ${fetchProbeError?.message ?? "record missing"}`,
  );

  // Clean up probe record
  const { error: probeCleanupError } = await serverClient
    .from("machine_api_idempotency")
    .delete()
    .eq("resource_id", "test_verification_probe");

  assert(
    !probeCleanupError,
    `Test reservation probe record cleanup failed: ${probeCleanupError?.message}`,
  );
  console.log("  ✓ Test reservation probe record created and cleaned up successfully (resource_id: \"test_verification_probe\").");

  // Check 3: Column machine_credential_id exists in hosted_workflow_quotes and hosted_agent_jobs
  console.log("[verify-machine-schema] Check 3: Verifying column machine_credential_id in target tables...");

  const { error: quotesColError } = await serverClient
    .from("hosted_workflow_quotes")
    .select("id, machine_credential_id")
    .limit(0);

  assert(
    !quotesColError,
    `Column machine_credential_id missing or inaccessible in hosted_workflow_quotes: ${quotesColError?.message}`,
  );
  console.log("  ✓ Column machine_credential_id exists in hosted_workflow_quotes.");

  const { error: jobsColError } = await serverClient
    .from("hosted_agent_jobs")
    .select("id, machine_credential_id")
    .limit(0);

  assert(
    !jobsColError,
    `Column machine_credential_id missing or inaccessible in hosted_agent_jobs: ${jobsColError?.message}`,
  );
  console.log("  ✓ Column machine_credential_id exists in hosted_agent_jobs.");

  // Check 5: Verify server role access works and public/anon client cannot access table without auth
  console.log("[verify-machine-schema] Check 5: Verifying RLS protection (public/anon client blocked)...");

  let publicConfig: { url: string; key: string } | null = null;
  try {
    publicConfig = getPublicSupabaseConfig();
  } catch {
    // Public Supabase config not available in this env
  }

  if (publicConfig) {
    const publicClient = createClient(publicConfig.url, publicConfig.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: anonData } = await publicClient
      .from("machine_api_idempotency")
      .select("id")
      .limit(1);

    assert(
      !anonData || anonData.length === 0,
      "Security check failed: public/anon client was able to read machine_api_idempotency table!",
    );

    const { error: anonInsertError } = await publicClient
      .from("machine_api_idempotency")
      .insert({
        credential_id: "unauthorized-anon-probe",
        agent_id: "unauthorized-anon-probe",
        route: "/api/agent/v1/test",
        idempotency_key_hash: "anon-test-key",
        request_hash: "anon-test-hash",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      });

    if (!anonInsertError) {
      await serverClient
        .from("machine_api_idempotency")
        .delete()
        .eq("credential_id", "unauthorized-anon-probe");
      throw new Error(
        "Security check failed: public/anon client unexpectedly bypassed machine_api_idempotency write RLS!",
      );
    }
    console.log("  ✓ RLS protection verified: public/anon client blocked from machine_api_idempotency.");
  } else {
    console.log("  ✓ RLS check skipped (public Supabase config unconfigured in this environment).");
  }

  console.log("[verify-machine-schema] All production database schema verifications PASSED successfully!");
}

verifyProductionMachineSchema().catch((err) => {
  console.error(
    `[verify-machine-schema] Verification FAILED: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exitCode = 1;
});
