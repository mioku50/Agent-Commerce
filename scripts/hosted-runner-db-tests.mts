/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "../lib/supabase/env.ts";
import {
  getServerDatabaseDiagnostic,
  getServerSupabaseConfig,
} from "../lib/supabase/server-env.ts";

type LaunchRow = {
  job_id: string | null;
  created: boolean;
  reason: "created" | "idempotent" | "active_job" | "cooldown" | "rate_limited";
  retry_after_seconds: number;
};

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function launch(
  client: SupabaseClient,
  input: { idempotency: string; fingerprint: string },
) {
  const { data, error } = await client.rpc("launch_hosted_agent_job", {
    p_idempotency_hash: input.idempotency,
    p_requester_fingerprint: input.fingerprint,
    p_requester_wallet: null,
    p_task: "Phase 19 hosted buyer-agent database policy test",
    p_budget_usdc: 0.001,
    p_cooldown_seconds: 30,
    p_rate_window_seconds: 3_600,
    p_rate_max_runs: 3,
  });
  if (error) throw new Error(`Hosted launch RPC failed: ${error.message}`);
  const row = (data as LaunchRow[] | null)?.[0];
  assert(row, "Hosted launch RPC returned no row.");
  return row;
}

async function main() {
  const marker = randomUUID();
  const publicConfig = getPublicSupabaseConfig();
  const serverConfig = getServerSupabaseConfig();
  const diagnostic = getServerDatabaseDiagnostic();
  console.log(
    `[hosted-test] provider=${diagnostic.provider} public=${diagnostic.publicClient.configured ? "configured" : "missing"} server=${diagnostic.serverClient.credential ?? "missing"}`,
  );

  const server = createClient(serverConfig.url, serverConfig.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const publicClient = createClient(publicConfig.url, publicConfig.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const createdIds: string[] = [];

  const { data: active, error: activeError } = await server
    .from("hosted_agent_jobs")
    .select("id")
    .in("status", ["queued", "running"])
    .limit(1);
  assert(!activeError, `Unable to check active hosted jobs: ${activeError?.message}`);
  assert((active ?? []).length === 0, "A real hosted job is active; retry tests after it completes.");

  try {
    const fingerprint = digest(`${marker}:requester`);
    const idempotency = digest(`${marker}:idempotency`);
    const first = await launch(server, { idempotency, fingerprint });
    assert(first.created && first.reason === "created" && first.job_id, "Initial launch was not created.");
    createdIds.push(first.job_id);

    const repeated = await launch(server, { idempotency, fingerprint });
    assert(
      !repeated.created && repeated.reason === "idempotent" && repeated.job_id === first.job_id,
      "Repeated idempotency key did not return the original job.",
    );

    const blocked = await launch(server, {
      idempotency: digest(`${marker}:blocked`),
      fingerprint: digest(`${marker}:other-requester`),
    });
    assert(!blocked.job_id && blocked.reason === "active_job", "Global one-active-job lock failed.");

    const { error: finishError } = await server
      .from("hosted_agent_jobs")
      .update({ status: "completed", progress_stage: "completed", completed_at: new Date().toISOString() })
      .eq("id", first.job_id);
    assert(!finishError, `Unable to complete test job: ${finishError?.message}`);

    const cooldown = await launch(server, {
      idempotency: digest(`${marker}:cooldown`),
      fingerprint,
    });
    assert(!cooldown.job_id && cooldown.reason === "cooldown", "Requester cooldown was not enforced.");

    const rateFingerprint = digest(`${marker}:rate-requester`);
    const rateRows = [31, 32, 33].map((secondsAgo, index) => ({
      idempotency_hash: digest(`${marker}:rate:${index}`),
      requester_fingerprint: rateFingerprint,
      task: "Phase 19 hosted buyer-agent rate-limit test",
      budget_usdc: 0.001,
      status: "completed",
      progress_stage: "completed",
      completed_at: new Date(Date.now() - secondsAgo * 1_000).toISOString(),
      created_at: new Date(Date.now() - secondsAgo * 1_000).toISOString(),
      raw: { phase19_test: marker },
    }));
    const { data: insertedRateRows, error: rateInsertError } = await server
      .from("hosted_agent_jobs")
      .insert(rateRows)
      .select("id");
    assert(!rateInsertError, `Unable to prepare rate-limit test: ${rateInsertError?.message}`);
    createdIds.push(...(insertedRateRows ?? []).map((row) => row.id as string));

    const rateLimited = await launch(server, {
      idempotency: digest(`${marker}:rate:blocked`),
      fingerprint: rateFingerprint,
    });
    assert(!rateLimited.job_id && rateLimited.reason === "rate_limited", "Rate limit was not enforced.");

    const { data: failedJob, error: failedInsertError } = await server
      .from("hosted_agent_jobs")
      .insert({
        idempotency_hash: digest(`${marker}:recovery`),
        requester_fingerprint: digest(`${marker}:recovery-requester`),
        task: "Phase 19 hosted buyer-agent failed-job recovery test",
        budget_usdc: 0.001,
        status: "failed",
        progress_stage: "failed",
        error: "Synthetic pre-payment failure",
        raw: { phase19_test: marker },
      })
      .select("id")
      .single();
    assert(!failedInsertError && failedJob, `Unable to prepare recovery test: ${failedInsertError?.message}`);
    createdIds.push(failedJob.id as string);

    const { data: recovered, error: recoveryError } = await server.rpc(
      "requeue_failed_hosted_agent_job",
      { p_job_id: failedJob.id },
    );
    assert(!recoveryError && recovered === true, "Safe failed-job recovery did not requeue the job.");
    const { data: recoveredJob, error: recoveredReadError } = await server
      .from("hosted_agent_jobs")
      .select("status,progress_stage,recovery_count,error")
      .eq("id", failedJob.id)
      .single();
    assert(
      !recoveredReadError &&
        recoveredJob.status === "queued" &&
        recoveredJob.progress_stage === "queued" &&
        recoveredJob.recovery_count === 1 &&
        recoveredJob.error === null,
      "Recovered job metadata is incorrect.",
    );

    const { data: publicRows, error: publicReadError } = await publicClient
      .from("hosted_agent_jobs")
      .select("id")
      .eq("id", first.job_id);
    assert(!publicReadError && (publicRows ?? []).length === 0, "Hosted job table leaked through public RLS.");

    console.log(
      "[hosted-test] passed: idempotency, one-active-wallet lock, cooldown, rate-limit, safe failed-job recovery, public RLS",
    );
  } finally {
    if (createdIds.length > 0) {
      const { error } = await server.from("hosted_agent_jobs").delete().in("id", createdIds);
      if (error) console.error("[hosted-test] warning: test job cleanup failed");
    }
  }
}

main().catch((error) => {
  console.error(
    `[hosted-test] failed: ${error instanceof Error ? error.message : "Unknown error"}`,
  );
  process.exitCode = 1;
});
