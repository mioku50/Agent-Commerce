/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client as PostgresClient } from "pg";
import { getPublicSupabaseConfig } from "../lib/supabase/env.ts";
import { tryGetServerSupabaseConfig } from "../lib/supabase/server-env.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function verifyProductionMonitoringSchema() {
  console.log("[verify-monitoring-schema] Starting production verification...");
  const serverConfig = tryGetServerSupabaseConfig();
  assert(
    serverConfig,
    "Server Supabase configuration is required for production verification.",
  );
  const server = createClient(serverConfig.url, serverConfig.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const postgresUrl =
    process.env.AGENT_DB_POSTGRES_URL_NON_POOLING ??
    process.env.POSTGRES_URL_NON_POOLING;
  assert(postgresUrl, "A non-pooling PostgreSQL connection is required.");
  const connectionUrl = new URL(postgresUrl);
  connectionUrl.searchParams.delete("sslmode");
  connectionUrl.searchParams.delete("sslrootcert");
  const postgres = new PostgresClient({
    connectionString: connectionUrl.toString(),
    ssl: { rejectUnauthorized: false },
  });
  await postgres.connect();

  try {
    const tableChecks = await Promise.all([
      server
        .from("trust_profiles")
        .select(
          "id,public_id,canonical_subject_key,subject_type,canonical_subject_input,display_name,created_at,updated_at",
        )
        .limit(0),
      server
        .from("trust_watchlists")
        .select(
          "id,public_id,owner_wallet,label,subject_hash,subject_input,profile_id,visibility,cadence,status,next_recheck_at,last_recheck_at,last_snapshot_id,last_job_id,last_error_code,last_error_at,byoa_agent_id,machine_credential_id,created_at,updated_at",
        )
        .limit(0),
      server
        .from("trust_monitoring_rechecks")
        .select(
          "id,public_id,watchlist_id,trigger,status,idempotency_hash,quote_id,job_id,byoa_agent_id,machine_credential_id,scheduled_for,error_code,error_message,created_at,started_at,completed_at,updated_at",
        )
        .limit(0),
      server
        .from("trust_monitoring_snapshots")
        .select(
          "id,public_id,watchlist_id,recheck_id,job_id,sequence_number,trust_score,trust_status,report_hash,verification_status,proof_transaction_hash,report_snapshot,delta_snapshot,observed_at,created_at",
        )
        .limit(0),
      server
        .from("hosted_workflow_user_payments")
        .select("id,sponsorship_source")
        .limit(0),
    ]);
    const tableFailure = tableChecks.find((result) => result.error)?.error;
    assert(
      !tableFailure,
      `Monitoring tables or required columns are missing: ${tableFailure?.message}`,
    );
    console.log(
      "  ✓ Canonical profiles, watchlists, rechecks, snapshots, and sponsorship source exist.",
    );

    const schemaMetadata = await postgres.query<{
      rls_enabled: boolean;
      index_names: string[];
      constraint_names: string[];
    }>(`
      select
        profile.relrowsecurity as rls_enabled,
        coalesce((
          select array_agg(indexname order by indexname)
          from pg_indexes
          where schemaname = 'public'
            and indexname in (
              'trust_profiles_canonical_subject_key_key',
              'trust_watchlists_owner_profile_tenant_idx',
              'trust_watchlists_public_profile_idx'
            )
        ), array[]::text[]) as index_names,
        coalesce((
          select array_agg(constraint_name order by constraint_name)
          from information_schema.table_constraints
          where table_schema = 'public'
            and (
              (table_name = 'trust_profiles' and constraint_type in ('PRIMARY KEY', 'UNIQUE', 'CHECK'))
              or (
                table_name = 'trust_watchlists'
                and constraint_name = 'trust_watchlists_visibility_check'
              )
            )
        ), array[]::text[]) as constraint_names
      from pg_class profile
      join pg_namespace namespace on namespace.oid = profile.relnamespace
      where namespace.nspname = 'public'
        and profile.relname = 'trust_profiles'
    `);
    const metadata = schemaMetadata.rows[0];
    assert(metadata?.rls_enabled, "RLS is not enabled on trust_profiles.");
    for (const index of [
      "trust_profiles_canonical_subject_key_key",
      "trust_watchlists_owner_profile_tenant_idx",
      "trust_watchlists_public_profile_idx",
    ]) {
      assert(
        metadata.index_names.includes(index),
        `Required monitoring index is missing: ${index}`,
      );
    }
    assert(
      metadata.constraint_names.includes("trust_watchlists_visibility_check"),
      "The trust watchlist visibility constraint is missing.",
    );
    console.log("  ✓ P3.1 indexes, constraints, and trust_profiles RLS are active.");

    const noopClaim = await server.rpc("claim_due_trust_watchlists_v1", {
      p_limit: 0,
    });
    assert(
      !noopClaim.error && Array.isArray(noopClaim.data) && noopClaim.data.length === 0,
      `No-op scheduler claim RPC failed: ${noopClaim.error?.message ?? "unexpected rows"}`,
    );
    const missingLaunch = await server.rpc("launch_trust_monitoring_checkout_v1", {
      p_quote_id: randomUUID(),
      p_recheck_id: randomUUID(),
    });
    const missingLaunchRow = (
      missingLaunch.data as Array<{ reason?: string }> | null
    )?.[0];
    assert(
      !missingLaunch.error && missingLaunchRow?.reason === "not_found",
      `Scheduled checkout RPC failed its non-mutating probe: ${missingLaunch.error?.message ?? "unexpected result"}`,
    );
    console.log("  ✓ Scheduler claim and checkout RPCs are callable server-side.");

    const marker = randomUUID();
    const publicId = `wtl_${digest(marker).slice(0, 20)}`;
    const profilePublicId = `vtr_${digest(`${marker}:profile`).slice(0, 20)}`;
    const recheckPublicId = `trc_${digest(`${marker}:recheck`).slice(0, 20)}`;
    const ownerWallet = `0x${digest(`${marker}:wallet`).slice(0, 40)}`;
    const subject = { repositoryUrl: "https://github.com/openai/openai-node" };
    const subjectDigest = digest(JSON.stringify(subject));
    const canonicalKey = `github:production-schema-probe/${digest(marker).slice(0, 12)}`;
    const idempotencyDigest = digest(`${marker}:idempotency`);
    let watchlistId: string | null = null;
    let profileId: string | null = null;

    try {
      const profile = await server
        .from("trust_profiles")
        .insert({
          public_id: profilePublicId,
          canonical_subject_key: canonicalKey,
          subject_type: "github_repository",
          canonical_subject_input: subject,
          display_name: "Production schema probe",
        })
        .select("id")
        .single();
      assert(
        !profile.error && profile.data,
        `Server write access to trust_profiles failed: ${profile.error?.message}`,
      );
      profileId = profile.data.id as string;

      const duplicateProfile = await server.from("trust_profiles").insert({
        canonical_subject_key: canonicalKey,
        subject_type: "github_repository",
        canonical_subject_input: subject,
        display_name: "Duplicate profile probe",
      });
      assert(
        Boolean(duplicateProfile.error),
        "Canonical subject uniqueness was not enforced.",
      );

      const watchlist = await server
        .from("trust_watchlists")
        .insert({
          public_id: publicId,
          owner_wallet: ownerWallet,
          label: "Production schema probe",
          subject_hash: subjectDigest,
          subject_input: subject,
          profile_id: profileId,
          visibility: "private",
          cadence: "manual",
          status: "active",
        })
        .select("id")
        .single();
    assert(
      !watchlist.error && watchlist.data,
      `Server write access to trust_watchlists failed: ${watchlist.error?.message}`,
    );
    watchlistId = watchlist.data.id as string;

      const invalidCadence = await server.from("trust_watchlists").insert({
        owner_wallet: ownerWallet,
        label: "Invalid cadence probe",
        subject_hash: digest(`${marker}:invalid`),
        subject_input: subject,
        profile_id: profileId,
        cadence: "hourly",
        status: "active",
      });
      assert(
        Boolean(invalidCadence.error),
        "Cadence check constraint did not reject an unsupported value.",
      );
      const invalidVisibility = await server.from("trust_watchlists").insert({
        owner_wallet: ownerWallet,
        label: "Invalid visibility probe",
        subject_hash: digest(`${marker}:invalid-visibility`),
        subject_input: subject,
        profile_id: profileId,
        visibility: "unlisted",
        cadence: "manual",
        status: "active",
      });
      assert(
        Boolean(invalidVisibility.error),
        "Visibility check constraint did not reject an unsupported value.",
      );
      const duplicateWatchlist = await server.from("trust_watchlists").insert({
        owner_wallet: ownerWallet,
        label: "Duplicate canonical subject probe",
        subject_hash: digest(`${marker}:different-format`),
        subject_input: { repositoryUrl: "github.com/openai/openai-node/tree/main" },
        profile_id: profileId,
        visibility: "private",
        cadence: "manual",
        status: "active",
      });
      assert(
        Boolean(duplicateWatchlist.error),
        "Unique owner/profile tenant constraint was not enforced.",
      );

    const recheck = await server.from("trust_monitoring_rechecks").insert({
      public_id: recheckPublicId,
      watchlist_id: watchlistId,
      trigger: "manual",
      status: "quoted",
      idempotency_hash: idempotencyDigest,
    });
    assert(
      !recheck.error,
      `Server write access to trust_monitoring_rechecks failed: ${recheck.error?.message}`,
    );

    const duplicateRecheck = await server
      .from("trust_monitoring_rechecks")
      .insert({
        watchlist_id: watchlistId,
        trigger: "manual",
        status: "quoted",
        idempotency_hash: idempotencyDigest,
      });
    assert(
      Boolean(duplicateRecheck.error),
      "Unique watchlist/idempotency constraint was not enforced.",
    );
    console.log("  ✓ Database checks and unique idempotency constraint are enforced.");

      const publicConfig = getPublicSupabaseConfig();
      const anonymous = createClient(publicConfig.url, publicConfig.key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const anonymousReads = await Promise.all([
        anonymous.from("trust_profiles").select("id").limit(1),
        anonymous.from("trust_watchlists").select("id").limit(1),
        anonymous.from("trust_monitoring_rechecks").select("id").limit(1),
        anonymous.from("trust_monitoring_snapshots").select("id").limit(1),
      ]);
    assert(
      anonymousReads.every(
        (result) => !result.data || result.data.length === 0,
      ),
      "Anonymous access exposed private monitoring rows.",
    );
      const anonymousInsert = await anonymous.from("trust_profiles").insert({
        canonical_subject_key: `${canonicalKey}:anonymous`,
        subject_type: "github_repository",
        canonical_subject_input: subject,
        display_name: "Anonymous probe",
      });
    if (!anonymousInsert.error) {
      await server
        .from("trust_profiles")
        .delete()
        .eq("canonical_subject_key", `${canonicalKey}:anonymous`);
      throw new Error("Anonymous monitoring writes unexpectedly bypassed RLS.");
    }
    console.log("  ✓ Anonymous reads and writes are denied by RLS.");
    } finally {
      if (watchlistId) {
        const cleanup = await server
          .from("trust_watchlists")
          .delete()
          .eq("id", watchlistId);
        assert(
          !cleanup.error,
          `Production watchlist probe cleanup failed: ${cleanup.error?.message}`,
        );
      }
      if (profileId) {
        const cleanup = await server
          .from("trust_profiles")
          .delete()
          .eq("id", profileId);
        assert(
          !cleanup.error,
          `Production profile probe cleanup failed: ${cleanup.error?.message}`,
        );
      }
    }

    console.log("[verify-monitoring-schema] All production checks PASSED.");
  } finally {
    await postgres.end();
  }
}

verifyProductionMonitoringSchema().catch((error) => {
  console.error(
    `[verify-monitoring-schema] Verification FAILED: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
