import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function connectionEnvironment() {
  const raw = process.env.AGENT_DB_POSTGRES_URL_NON_POOLING?.trim();
  if (!raw) throw new Error("AGENT_DB_POSTGRES_URL_NON_POOLING is required.");
  const parsed = new URL(raw);
  if (!/^postgres(?:ql)?:$/.test(parsed.protocol) || parsed.searchParams.get("pgbouncer") === "true") {
    throw new Error("A non-pooling PostgreSQL connection is required.");
  }
  return {
    ...process.env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGDATABASE: decodeURIComponent(parsed.pathname.replace(/^\//, "") || "postgres"),
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGSSLMODE: parsed.searchParams.get("sslmode") || "require",
  };
}

const marker = `lease-${Date.now()}-${randomBytes(5).toString("hex")}`;
const publicId = `agt_${digest(marker).slice(0, 20)}`;
const owner = privateKeyToAccount(generatePrivateKey()).address;
const agent = privateKeyToAccount(generatePrivateKey()).address;
const prefix = `aac_${digest(`${marker}:prefix`).slice(0, 8)}`;

const sql = `
begin;
do $test$
declare
  v_agent_id uuid;
  v_credential_id uuid;
  v_quote_id uuid;
  v_claim_token uuid;
  v_event_id uuid := gen_random_uuid();
  v_job_id uuid;
  v_payment_id uuid;
  v_created boolean;
  v_reason text;
begin
  if exists (select 1 from public.hosted_agent_jobs where status in ('queued','running')) then
    raise exception 'hosted execution slot is busy';
  end if;

  select created.agent_id into v_agent_id
  from public.create_byoa_agent_v1(
    ${sqlLiteral(publicId)},
    'Settlement lease DB test',
    ${sqlLiteral(owner)},
    ${sqlLiteral(agent)}
  ) created;
  update public.byoa_agents
  set agent_wallet_status = 'verified', status = 'active', canary_enabled = true,
      wallet_verified_at = now()
  where id = v_agent_id;
  update public.byoa_agent_policies
  set allowed_workflows = array['sentiment_tone']::text[],
      allowed_service_types = array['internal_deterministic']::text[],
      max_price_per_run_usdc = 0.005,
      daily_spend_limit_usdc = 0.01,
      max_daily_calls = 3,
      status = 'active'
  where agent_id = v_agent_id;

  insert into public.byoa_agent_credentials (
    agent_id, label, token_prefix, credential_hash, scopes, expires_at
  ) values (
    v_agent_id, 'Settlement test credential', ${sqlLiteral(prefix)},
    ${sqlLiteral(digest(`${marker}:credential`))},
    array['quotes:create','workflows:execute','results:read']::text[],
    now() + interval '1 hour'
  ) returning id into v_credential_id;

  select reserved.quote_id into v_quote_id
  from public.reserve_byoa_workflow_quote_v1(
    v_agent_id,
    v_credential_id,
    ${sqlLiteral(digest(`${marker}:idempotency`))},
    ${sqlLiteral(digest(`${marker}:request`))},
    ${sqlLiteral(digest(`${marker}:fingerprint`))},
    'sentiment_tone',
    'Verify settlement recovery after an expired claim lease.',
    'Safe settlement recovery database test input.',
    ${sqlLiteral(digest(`${marker}:input`))},
    0.005,
    '{"version":3,"selectedServices":[{"slug":"text-analyzer"}]}'::jsonb,
    '[{"slug":"text-analyzer"}]'::jsonb,
    array['internal_deterministic']::text[],
    0.002,
    2000,
    ${sqlLiteral(owner)},
    now() + interval '10 minutes'
  ) reserved;
  if v_quote_id is null then raise exception 'quote reservation failed'; end if;

  select claimed.claim_token into v_claim_token
  from public.claim_byoa_quote_settlement_v1(v_quote_id, v_credential_id) claimed;
  if v_claim_token is null then raise exception 'settlement claim failed'; end if;

  update public.byoa_workflow_quotes
  set settle_claim_expires_at = now() - interval '1 second'
  where id = v_quote_id;
  insert into public.payment_events (
    id, endpoint, payer, amount_usdc, network, gateway_tx, onchain_seller
  )
  select v_event_id, resource_path, ${sqlLiteral(agent)}, '0.002', network,
         'transactional-db-test', ${sqlLiteral(owner)}
  from public.byoa_workflow_quotes where id = v_quote_id;

  select consumed.job_id, consumed.payment_id, consumed.created, consumed.reason
    into v_job_id, v_payment_id, v_created, v_reason
  from public.consume_byoa_quote_v1(v_quote_id, v_claim_token, v_event_id) consumed;
  if not v_created or v_reason <> 'created' or v_job_id is null or v_payment_id is null then
    raise exception 'expired exact settlement was not recovered: %', coalesce(v_reason, 'none');
  end if;
  if (select count(*) from public.byoa_workflow_payments where quote_id = v_quote_id) <> 1
    or (select count(*) from public.hosted_agent_jobs where byoa_quote_id = v_quote_id) <> 1 then
    raise exception 'settlement recovery created duplicate persistence';
  end if;
end;
$test$;
rollback;
`;

const result = spawnSync(
  "psql",
  ["--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--quiet"],
  {
    cwd: process.cwd(),
    env: connectionEnvironment(),
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  },
);

if (result.status !== 0) {
  throw new Error("Transactional BYOA settlement recovery test failed.");
}

console.log("[byoa-settlement-db-test] passed: an exact settled payment survives lease expiry, persists once, and rolls back all test data");
