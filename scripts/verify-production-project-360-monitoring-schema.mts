/** Read-only P4.3 Production schema, RLS, and policy verifier. */
import { createClient } from "@supabase/supabase-js";
import { Client as PostgresClient } from "pg";
import { getPublicSupabaseConfig } from "../lib/supabase/env.ts";
import { tryGetServerSupabaseConfig } from "../lib/supabase/server-env.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const TABLES = [
  "project_360_monitors",
  "project_360_monitor_rechecks",
  "project_360_monitor_snapshots",
  "project_360_monitor_suggestions",
] as const;

async function main() {
  console.log("[verify-p43-schema] Starting read-only Production verification...");
  const serverConfig = tryGetServerSupabaseConfig();
  assert(serverConfig, "Server Supabase configuration is required.");
  const publicConfig = getPublicSupabaseConfig();
  assert(publicConfig.url === serverConfig.url, "Runtime public and service-role clients target different Supabase projects.");
  const postgresUrl = process.env.AGENT_DB_POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL_NON_POOLING;
  assert(postgresUrl, "A non-pooling PostgreSQL connection is required.");
  const connection = new URL(postgresUrl);
  connection.searchParams.delete("sslmode");
  connection.searchParams.delete("sslrootcert");
  const postgres = new PostgresClient({ connectionString: connection.toString(), ssl: { rejectUnauthorized: false } });
  const server = createClient(serverConfig.url, serverConfig.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonymous = createClient(publicConfig.url, publicConfig.key, { auth: { persistSession: false, autoRefreshToken: false } });
  await postgres.connect();
  try {
    const serviceChecks = await Promise.all(TABLES.map((table) => server.from(table).select("id").limit(0)));
    assert(serviceChecks.every((result) => !result.error), "Service-role access or a P4.3 table is unavailable.");
    const anonymousChecks = await Promise.all(TABLES.map((table) => anonymous.from(table).select("id").limit(1)));
    assert(anonymousChecks.every((result) => result.error || (result.data?.length ?? 0) === 0), "Anonymous access exposed a Project 360 monitoring row.");

    const relations = await postgres.query<{ relname: string; relrowsecurity: boolean }>(`
      select relation.relname, relation.relrowsecurity
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = any($1::text[])
      order by relation.relname
    `, [[...TABLES]]);
    assert(relations.rows.length === TABLES.length, "A P4.3 table is missing.");
    assert(relations.rows.every((row) => row.relrowsecurity), "RLS is not enabled on every P4.3 table.");
    const privileges = await postgres.query<{
      relname: string;
      anon_select: boolean;
      authenticated_select: boolean;
      service_select: boolean;
    }>(`
      select relation.relname,
        has_table_privilege('anon', relation.oid, 'select') as anon_select,
        has_table_privilege('authenticated', relation.oid, 'select') as authenticated_select,
        has_table_privilege('service_role', relation.oid, 'select') as service_select
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = any($1::text[])
    `, [[...TABLES]]);
    assert(
      privileges.rows.every((row) => !row.anon_select && !row.authenticated_select && row.service_select),
      "Direct anon/authenticated access is not denied or service-role access is missing.",
    );

    const indexes = await postgres.query<{ indexname: string }>(`
      select indexname from pg_indexes
      where schemaname = 'public'
        and indexname = any($1::text[])
    `, [[
      "project_360_monitors_owner_profile_uidx",
      "project_360_monitors_due_idx",
      "project_360_monitor_rechecks_monitor_created_idx",
      "project_360_monitor_snapshots_history_idx",
      "project_360_monitor_suggestions_pending_idx",
      "trust_alert_events_project_360_snapshot_idx",
    ]]);
    assert(indexes.rows.length === 6, "A required P4.3 index is missing.");

    const definitions = await postgres.query<{ name: string; definition: string }>(`
      select routine.proname as name, pg_get_functiondef(routine.oid) as definition
      from pg_proc routine
      join pg_namespace namespace on namespace.oid = routine.pronamespace
      where namespace.nspname = 'public'
        and routine.proname = any($1::text[])
    `, [[
      "prevent_project_360_monitor_config_change_v1",
      "claim_due_project_360_monitors_v1",
      "launch_project_360_monitoring_checkout_v1",
    ]]);
    assert(definitions.rows.length === 3, "A required P4.3 function is missing.");
    const launch = definitions.rows.find((row) => row.name === "launch_project_360_monitoring_checkout_v1")?.definition ?? "";
    for (const invariant of ["configuration_hash", "source_value_hashes", "selected_modules", "scheduled_monitoring"]) {
      assert(launch.includes(invariant), `Scheduled launch policy is missing ${invariant}.`);
    }
    const immutable = definitions.rows.find((row) => row.name === "prevent_project_360_monitor_config_change_v1")?.definition ?? "";
    for (const field of ["project_input", "selected_modules", "source_value_hashes", "selected_candidates_snapshot"]) {
      assert(immutable.includes(field), `Immutable monitor trigger is missing ${field}.`);
    }

    const noClaim = await server.rpc("claim_due_project_360_monitors_v1", { p_limit: 0 });
    assert(!noClaim.error && Array.isArray(noClaim.data) && noClaim.data.length === 0, "No-op Project 360 scheduler claim failed.");
    console.log("  ✓ P4.3 tables, indexes, RLS, service access, anonymous denial, immutable configuration, and launch policy verified.");
    console.log("[verify-p43-schema] PASS");
  } finally {
    await postgres.end();
  }
}

await main();
