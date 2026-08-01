/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from "@supabase/supabase-js";
import { Client as PostgresClient } from "pg";
import { getPublicSupabaseConfig } from "../lib/supabase/env.ts";
import { tryGetServerSupabaseConfig } from "../lib/supabase/server-env.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function verifyProductionProject360Schema() {
  console.log("[verify-project-360-schema] Starting read-only production verification...");
  const serverConfig = tryGetServerSupabaseConfig();
  assert(serverConfig, "Server Supabase configuration is required.");
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
        .from("project_360_discoveries")
        .select("id,public_id,owner_wallet,machine_credential_id,status,revision,primary_type,primary_value,primary_value_hash,idempotency_hash,request_hash,candidates_hash,warnings,error_code,expires_at,created_at,started_at,completed_at,updated_at")
        .limit(0),
      server
        .from("project_360_candidates")
        .select("id,public_id,discovery_id,source_type,module,canonical_value,value_hash,origin_kind,origin_repository,file_path,line_start,line_end,safe_excerpt,confidence,confidence_score,reason_code,validation_status,origin_fingerprint,created_at,validated_at")
        .limit(0),
      server
        .from("project_360_quotes")
        .select("quote_id,discovery_id,discovery_revision,candidates_hash,selection_hash,selected_candidate_ids,confirmed_sources,module_price_snapshot,expected_coverage_count,warnings,created_at")
        .limit(0),
      server
        .from("project_360_module_runs")
        .select("id,job_id,module,status,input_hash,attempt_count,child_report_hash,score,confidence,result_snapshot,error_code,started_at,completed_at,updated_at")
        .limit(0),
    ]);
    const tableError = tableChecks.find((result) => result.error)?.error;
    assert(!tableError, `Project 360 table or column is missing: ${tableError?.message}`);
    console.log("  ✓ Project 360 tables and required columns exist; server access works.");

    const relations = await postgres.query<{
      relname: string;
      relrowsecurity: boolean;
    }>(`
      select relation.relname, relation.relrowsecurity
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname in (
          'project_360_discoveries', 'project_360_candidates',
          'project_360_quotes', 'project_360_module_runs'
        )
      order by relation.relname
    `);
    assert(
      relations.rows.length === 4 && relations.rows.every((row) => row.relrowsecurity),
      "RLS is not enabled on every Project 360 table.",
    );

    const indexes = await postgres.query<{ indexname: string }>(`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and indexname in (
          'project_360_discoveries_browser_idem_idx',
          'project_360_discoveries_machine_idem_idx',
          'project_360_candidates_discovery_idx',
          'project_360_quotes_discovery_idx',
          'project_360_module_runs_job_status_idx'
        )
    `);
    const indexNames = new Set(indexes.rows.map((row) => row.indexname));
    for (const name of [
      "project_360_discoveries_browser_idem_idx",
      "project_360_discoveries_machine_idem_idx",
      "project_360_candidates_discovery_idx",
      "project_360_quotes_discovery_idx",
      "project_360_module_runs_job_status_idx",
    ]) {
      assert(indexNames.has(name), `Required Project 360 index is missing: ${name}`);
    }

    const constraints = await postgres.query<{ conname: string; definition: string }>(`
      select constraint_row.conname,
             pg_get_constraintdef(constraint_row.oid) as definition
      from pg_constraint constraint_row
      join pg_class relation on relation.oid = constraint_row.conrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and constraint_row.conname in (
          'hosted_workflow_quotes_workflow_type_check',
          'hosted_agent_jobs_workflow_type_check',
          'byoa_agent_policies_allowed_workflows_check',
          'project_360_candidates_provenance_key',
          'project_360_module_runs_job_module_key'
        )
    `);
    const definitions = new Map(
      constraints.rows.map((row) => [row.conname, row.definition]),
    );
    for (const name of [
      "hosted_workflow_quotes_workflow_type_check",
      "hosted_agent_jobs_workflow_type_check",
      "byoa_agent_policies_allowed_workflows_check",
    ]) {
      assert(definitions.get(name)?.includes("project_360"), `${name} does not allow project_360.`);
    }
    assert(
      definitions.has("project_360_candidates_provenance_key"),
      "Candidate provenance uniqueness constraint is missing.",
    );
    assert(
      definitions.has("project_360_module_runs_job_module_key"),
      "Module-run idempotency constraint is missing.",
    );
    console.log("  ✓ Idempotency indexes, uniqueness constraints, workflow policy, and RLS are active.");

    const grants = await postgres.query<{ table_name: string; grantee: string }>(`
      select table_name, grantee
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in (
          'project_360_discoveries', 'project_360_candidates',
          'project_360_quotes', 'project_360_module_runs'
        )
        and grantee in ('anon', 'authenticated')
    `);
    assert(grants.rows.length === 0, "Anonymous or authenticated table grants are present.");

    const publicConfig = getPublicSupabaseConfig();
    const anonymous = createClient(publicConfig.url, publicConfig.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const anonymousReads = await Promise.all([
      anonymous.from("project_360_discoveries").select("id").limit(1),
      anonymous.from("project_360_candidates").select("id").limit(1),
      anonymous.from("project_360_quotes").select("quote_id").limit(1),
      anonymous.from("project_360_module_runs").select("id").limit(1),
    ]);
    assert(
      anonymousReads.every((result) => Boolean(result.error)),
      "Anonymous access was not denied for every Project 360 table.",
    );
    console.log("  ✓ Anonymous access is denied fail-closed.");
    console.log("[verify-project-360-schema] PASS");
  } finally {
    await postgres.end();
  }
}

verifyProductionProject360Schema().catch((error) => {
  console.error(
    `[verify-project-360-schema] FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
