import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { parseSellerServiceRequest } from "../app/api/seller/services/validation.ts";

function postgresUrl() {
  const value = process.env.AGENT_DB_POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL_NON_POOLING;
  if (!value) throw new Error("Missing non-pooling PostgreSQL URL for seller integration test");
  const url = new URL(value);
  if (!/^postgres(?:ql)?:$/.test(url.protocol) || url.searchParams.get("pgbouncer") === "true") {
    throw new Error("Seller integration test requires a non-pooling PostgreSQL URL");
  }
  return url;
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function redactedError(stderr: string, environment: NodeJS.ProcessEnv) {
  let value = stderr;
  for (const secret of [environment.PGHOST, environment.PGUSER, environment.PGPASSWORD]) {
    if (secret) value = value.split(secret).join("[redacted]");
  }
  return value.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-postgres-url]").trim();
}

async function run() {
  console.log("[seller-integration] database=production-compatible-postgresql connection=non-pooling values=redacted");
  const marker = randomUUID();
  const serviceId = randomUUID();
  const slug = `phase272-db-${marker}`;
  const identifier = marker.replaceAll("-", "").padEnd(64, "0").slice(0, 64);

  const request = new Request("https://app.example/api/seller/services", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Phase 27.2 DB Constraint Test",
      slug,
      shortDescription: "PostgreSQL verification status integration row",
      longDescription: "Temporary transaction rolled back after assertions.",
      category: "Security",
      method: "POST",
      status: "draft",
      sourceType: "external_seller",
      priceUsd: 0.0005,
      fulfillmentUrl: "https://seller.example/v1/fulfill",
      sellerWallet: "0x8888888888888888888888888888888888888888",
      expectedNetwork: "eip155:5042002",
      expectedAsset: "0x3600000000000000000000000000000000000000",
      inputSchema: {}, outputSchema: {}, exampleRequest: {}, exampleResponse: {},
    }),
  });
  const parsed = await parseSellerServiceRequest(request, { isCreation: true });
  assert(!("error" in parsed), "Production-shaped external seller input must validate");

  const sql = `
begin;

insert into public.store_services (
  id, name, slug, short_description, long_description, category, method,
  price_usdc, status, source_type, input_schema, output_schema,
  example_request, example_response, fulfillment_url, seller_wallet,
  expected_network, expected_asset, wallet_verification_status,
  endpoint_verification_status
) values (
  ${sqlLiteral(serviceId)}::uuid,
  'Phase 27.2 DB Constraint Test',
  ${sqlLiteral(slug)},
  'PostgreSQL verification status integration row',
  'Temporary transaction rolled back after assertions.',
  'Security', 'POST', 0.0005, 'draft', 'external_seller',
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  'https://seller.example/v1/fulfill',
  '0x8888888888888888888888888888888888888888',
  'eip155:5042002',
  '0x3600000000000000000000000000000000000000',
  'unverified', 'unverified'
);

update public.store_services
set wallet_verification_status = 'failed', endpoint_verification_status = 'failed'
where id = ${sqlLiteral(serviceId)}::uuid;

do $$
declare
  v_wallet text;
  v_endpoint text;
  v_allowed boolean;
  v_locked boolean;
  v_retry integer;
  v_policy text;
begin
  select wallet_verification_status, endpoint_verification_status
  into v_wallet, v_endpoint
  from public.store_services where id = ${sqlLiteral(serviceId)}::uuid;
  if v_wallet <> 'failed' or v_endpoint <> 'failed' then
    raise exception 'failed verification statuses did not persist';
  end if;

  begin
    update public.store_services set wallet_verification_status = 'pending'
    where id = ${sqlLiteral(serviceId)}::uuid;
    raise exception 'invalid pending verification status was accepted';
  exception when check_violation then
    null;
  end;

  if has_column_privilege('anon', 'public.store_services', 'fulfillment_url', 'SELECT') then
    raise exception 'anon can select fulfillment_url';
  end if;
  if has_column_privilege('anon', 'public.store_services', 'wallet_verification_challenge', 'SELECT') then
    raise exception 'anon can select wallet verification challenge';
  end if;
  if has_column_privilege('anon', 'public.store_services', 'endpoint_verification_nonce', 'SELECT') then
    raise exception 'anon can select endpoint verification nonce';
  end if;
  if not has_column_privilege('anon', 'public.store_services', 'name', 'SELECT') then
    raise exception 'anon cannot select safe marketplace columns';
  end if;

  select qual into v_policy from pg_policies
  where schemaname = 'public' and tablename = 'store_services'
    and policyname = 'Allow public read of published services';
  if v_policy is null or v_policy like '%draft%' or v_policy like '%disabled%' or v_policy like '%verifying%' then
    raise exception 'public store_services policy exposes an operator-only status';
  end if;

  select allowed, locked, retry_after_seconds into v_allowed, v_locked, v_retry
  from public.consume_seller_auth_attempt(${sqlLiteral(identifier)}, false, 5, 900);
  if v_allowed or v_locked then raise exception 'first invalid login limiter result is wrong'; end if;
  select allowed, locked, retry_after_seconds into v_allowed, v_locked, v_retry
  from public.consume_seller_auth_attempt(${sqlLiteral(identifier)}, true, 5, 900);
  if not v_allowed or v_locked then raise exception 'valid login did not reset limiter'; end if;
end $$;

insert into public.external_fulfillment_credits (
  payment_fingerprint, service_id, endpoint, payer, amount_usdc, reason
) values (
  ${sqlLiteral(identifier)}, ${sqlLiteral(serviceId)},
  ${sqlLiteral(`/api/store/services/${slug}/invoke`)},
  '0x7777777777777777777777777777777777777777', 0.0005,
  'Synthetic downstream failure for integration test'
) on conflict (payment_fingerprint) do nothing;

insert into public.external_fulfillment_credits (
  payment_fingerprint, service_id, endpoint, payer, amount_usdc, reason
) values (
  ${sqlLiteral(identifier)}, ${sqlLiteral(serviceId)},
  ${sqlLiteral(`/api/store/services/${slug}/invoke`)},
  '0x7777777777777777777777777777777777777777', 0.0005,
  'Synthetic downstream failure replay'
) on conflict (payment_fingerprint) do nothing;

do $$
begin
  if (select count(*) from public.external_fulfillment_credits where payment_fingerprint = ${sqlLiteral(identifier)}) <> 1 then
    raise exception 'recovery credit replay created a duplicate';
  end if;
end $$;

rollback;
`;

  const url = postgresUrl();
  const environment = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "") || "postgres"),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get("sslmode") || "require",
  };
  const result = spawnSync("psql", [
    "--no-psqlrc",
    "--set", "ON_ERROR_STOP=1",
    "--quiet",
    "--command", sql,
  ], { env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    throw new Error(`PostgreSQL integration assertions failed: ${redactedError(String(result.stderr ?? ""), environment)}`);
  }
  console.log("[seller-integration] passed: failed statuses, exact constraints, public privileges/RLS, DB lockout, idempotent recovery credit");
}

run().catch((error) => {
  console.error("[seller-integration] failed", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
