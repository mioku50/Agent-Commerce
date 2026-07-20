-- Phase 28: Bring Your Own Agent.
-- External wallets remain non-custodial. All privileged reads and writes use
-- the service role through server-side routes; public access is projected by API.

create table if not exists public.byoa_agents (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^agt_[a-z0-9]{20}$'),
  display_name text not null check (char_length(display_name) between 2 and 80),
  owner_wallet text not null check (owner_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  agent_wallet text check (agent_wallet is null or agent_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  agent_wallet_status text not null default 'unverified'
    check (agent_wallet_status in ('unverified', 'verified', 'failed')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended', 'revoked')),
  canary_enabled boolean not null default false,
  wallet_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists byoa_agents_agent_wallet_unique_idx
  on public.byoa_agents (lower(agent_wallet)) where agent_wallet is not null;
create index if not exists byoa_agents_owner_created_idx
  on public.byoa_agents (lower(owner_wallet), created_at desc);

create table if not exists public.byoa_wallet_challenges (
  id uuid primary key default gen_random_uuid(),
  wallet text not null check (wallet ~ '^0x[0-9a-fA-F]{40}$'),
  action text not null check (action in ('owner_session', 'bind_agent_wallet')),
  origin text not null check (char_length(origin) between 8 and 300),
  chain_id bigint not null default 5042002 check (chain_id = 5042002),
  agent_id uuid references public.byoa_agents(id) on delete cascade,
  nonce_hash text not null unique check (nonce_hash ~ '^[0-9a-f]{64}$'),
  message_hash text not null check (message_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (action = 'owner_session' and agent_id is null)
    or (action = 'bind_agent_wallet' and agent_id is not null)
  )
);

create index if not exists byoa_wallet_challenges_expiry_idx
  on public.byoa_wallet_challenges (expires_at) where consumed_at is null;

create table if not exists public.byoa_agent_credentials (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.byoa_agents(id) on delete cascade,
  label text not null check (char_length(label) between 2 and 80),
  token_prefix text not null check (token_prefix ~ '^aac_[a-z0-9]{8}$'),
  credential_hash text not null unique check (credential_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null check (
    cardinality(scopes) between 1 and 8
    and scopes <@ array['quotes:create','workflows:execute','results:read','manifest:read']::text[]
  ),
  expires_at timestamptz not null,
  rotated_from_id uuid references public.byoa_agent_credentials(id) on delete set null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists byoa_agent_credentials_agent_created_idx
  on public.byoa_agent_credentials (agent_id, created_at desc);

create table if not exists public.byoa_agent_policies (
  agent_id uuid primary key references public.byoa_agents(id) on delete cascade,
  allowed_workflows text[] not null default array['sentiment_tone']::text[] check (
    cardinality(allowed_workflows) between 1 and 4
    and allowed_workflows <@ array['sentiment_tone','builder_update','market_context','custom_task']::text[]
  ),
  allowed_service_types text[] not null default array['internal_deterministic']::text[] check (
    cardinality(allowed_service_types) between 1 and 4
    and allowed_service_types <@ array['internal_deterministic','live_provider','seller_created','external_seller']::text[]
  ),
  max_price_per_run_usdc numeric(20, 6) not null default 0.005
    check (max_price_per_run_usdc between 0.001 and 0.005),
  daily_spend_limit_usdc numeric(20, 6) not null default 0.01
    check (daily_spend_limit_usdc between 0.001 and 1),
  max_daily_calls integer not null default 3 check (max_daily_calls between 1 and 100),
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.byoa_workflow_quotes (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.byoa_agents(id) on delete restrict,
  credential_id uuid not null references public.byoa_agent_credentials(id) on delete restrict,
  idempotency_hash text not null check (idempotency_hash ~ '^[0-9a-f]{64}$'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  requester_fingerprint text not null check (requester_fingerprint ~ '^[0-9a-f]{64}$'),
  workflow_type text not null check (workflow_type in ('sentiment_tone','builder_update','market_context','custom_task')),
  task text not null check (char_length(task) between 10 and 500),
  input_preview text not null check (char_length(input_preview) <= 240),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  budget_usdc numeric(20, 6) not null check (budget_usdc between 0.001 and 0.005),
  planner_snapshot jsonb not null check (jsonb_typeof(planner_snapshot) = 'object'),
  selected_services jsonb not null check (jsonb_typeof(selected_services) = 'array' and jsonb_array_length(selected_services) <= 3),
  service_types text[] not null check (
    cardinality(service_types) between 1 and 4
    and service_types <@ array['internal_deterministic','live_provider','seller_created','external_seller']::text[]
  ),
  price_usdc numeric(20, 6) not null check (price_usdc between 0.001 and 0.005),
  amount_atomic bigint not null check (amount_atomic between 1000 and 5000),
  pay_to text not null check (pay_to ~ '^0x[0-9a-fA-F]{40}$'),
  network text not null default 'eip155:5042002' check (network = 'eip155:5042002'),
  asset text not null default '0x3600000000000000000000000000000000000000'
    check (lower(asset) = '0x3600000000000000000000000000000000000000'),
  resource_path text not null default '',
  status text not null default 'quoted'
    check (status in ('quoted','settling','consumed','completed','failed','expired','credited','cancelled')),
  settle_claim_token uuid,
  settle_claim_expires_at timestamptz,
  aggregate_payment_event_id uuid references public.payment_events(id) on delete set null,
  job_id uuid references public.hosted_agent_jobs(id) on delete set null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, idempotency_hash)
);

create index if not exists byoa_workflow_quotes_agent_created_idx
  on public.byoa_workflow_quotes (agent_id, created_at desc);
create index if not exists byoa_workflow_quotes_expiry_idx
  on public.byoa_workflow_quotes (status, expires_at);

create table if not exists public.byoa_policy_reservations (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.byoa_agents(id) on delete cascade,
  quote_id uuid not null unique references public.byoa_workflow_quotes(id) on delete cascade,
  amount_usdc numeric(20, 6) not null check (amount_usdc > 0),
  call_count integer not null default 1 check (call_count = 1),
  status text not null default 'reserved' check (status in ('reserved','consumed','released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz
);

create index if not exists byoa_policy_reservations_agent_day_idx
  on public.byoa_policy_reservations (agent_id, created_at desc);

create table if not exists public.byoa_workflow_payments (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.byoa_agents(id) on delete restrict,
  quote_id uuid not null unique references public.byoa_workflow_quotes(id) on delete restrict,
  job_id uuid unique references public.hosted_agent_jobs(id) on delete set null,
  payment_event_id uuid not null unique references public.payment_events(id) on delete restrict,
  payer_wallet text not null check (payer_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  amount_usdc numeric(20, 6) not null check (amount_usdc > 0),
  gateway_transaction text,
  status text not null default 'settled'
    check (status in ('settled','completed','failed','credit_issued')),
  downstream_spent_usdc numeric(20, 6) not null default 0 check (downstream_spent_usdc >= 0),
  receipt_count integer not null default 0 check (receipt_count >= 0),
  verified_proof_count integer not null default 0 check (verified_proof_count >= 0),
  failure_reason text,
  settled_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.byoa_workflow_credits (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.byoa_workflow_payments(id) on delete restrict,
  agent_id uuid not null references public.byoa_agents(id) on delete restrict,
  amount_usdc numeric(20, 6) not null check (amount_usdc > 0),
  reason text not null check (char_length(reason) between 1 and 800),
  status text not null default 'issued' check (status in ('issued','redeemed','refund_pending','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.byoa_agent_passports (
  agent_id uuid primary key references public.byoa_agents(id) on delete cascade,
  total_workflows integer not null default 0 check (total_workflows >= 0),
  completed_reports integer not null default 0 check (completed_reports >= 0),
  successful_calls integer not null default 0 check (successful_calls >= 0),
  verified_proofs integer not null default 0 check (verified_proofs >= 0),
  workflow_spent_usdc numeric(20, 6) not null default 0 check (workflow_spent_usdc >= 0),
  downstream_spent_usdc numeric(20, 6) not null default 0 check (downstream_spent_usdc >= 0),
  success_rate numeric(7, 4) not null default 0 check (success_rate between 0 and 100),
  last_run_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.hosted_agent_jobs
  add column if not exists byoa_agent_id uuid references public.byoa_agents(id) on delete set null,
  add column if not exists byoa_quote_id uuid references public.byoa_workflow_quotes(id) on delete set null,
  add column if not exists aggregate_payment_event_id uuid references public.payment_events(id) on delete set null;

create unique index if not exists hosted_agent_jobs_byoa_quote_unique_idx
  on public.hosted_agent_jobs (byoa_quote_id) where byoa_quote_id is not null;
create index if not exists hosted_agent_jobs_byoa_agent_idx
  on public.hosted_agent_jobs (byoa_agent_id, created_at desc) where byoa_agent_id is not null;

alter table public.agent_runs
  add column if not exists byoa_agent_id uuid references public.byoa_agents(id) on delete set null;
create index if not exists agent_runs_byoa_agent_idx
  on public.agent_runs (byoa_agent_id, created_at desc) where byoa_agent_id is not null;

create or replace function public.set_byoa_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'byoa_agents','byoa_agent_policies','byoa_workflow_quotes',
    'byoa_workflow_payments','byoa_workflow_credits'
  ] loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'set_' || v_table || '_updated_at', v_table
    );
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_byoa_updated_at()',
      'set_' || v_table || '_updated_at', v_table
    );
  end loop;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'byoa_agents','byoa_wallet_challenges','byoa_agent_credentials',
    'byoa_agent_policies','byoa_workflow_quotes','byoa_policy_reservations',
    'byoa_workflow_payments','byoa_workflow_credits','byoa_agent_passports'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('drop policy if exists "Allow service access" on public.%I', v_table);
    execute format(
      'create policy "Allow service access" on public.%I for all to service_role using (true) with check (true)',
      v_table
    );
  end loop;
end;
$$;

create or replace function public.consume_byoa_wallet_challenge_v1(
  p_challenge_id uuid,
  p_wallet text,
  p_action text,
  p_origin text,
  p_message_hash text
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  update public.byoa_wallet_challenges
  set consumed_at = now()
  where id = p_challenge_id
    and lower(wallet) = lower(p_wallet)
    and action = p_action
    and origin = p_origin
    and chain_id = 5042002
    and message_hash = p_message_hash
    and consumed_at is null
    and expires_at > now()
  returning id into v_id;
  return v_id is not null;
end;
$$;

create or replace function public.create_byoa_agent_v1(
  p_public_id text,
  p_display_name text,
  p_owner_wallet text,
  p_agent_wallet text
)
returns table (agent_id uuid)
language plpgsql security definer set search_path = public
as $$
declare v_agent_id uuid;
begin
  insert into public.byoa_agents (
    public_id, display_name, owner_wallet, agent_wallet,
    agent_wallet_status, status, canary_enabled
  ) values (
    p_public_id, p_display_name, p_owner_wallet, p_agent_wallet,
    'unverified', 'pending', false
  ) returning id into v_agent_id;

  insert into public.byoa_agent_policies (agent_id) values (v_agent_id);
  insert into public.byoa_agent_passports (agent_id) values (v_agent_id);

  return query select v_agent_id;
end;
$$;

create or replace function public.rotate_byoa_credential_v1(
  p_owner_wallet text,
  p_agent_id uuid,
  p_previous_credential_id uuid,
  p_label text,
  p_token_prefix text,
  p_credential_hash text,
  p_scopes text[],
  p_expires_at timestamptz
)
returns table (credential_id uuid, reason text)
language plpgsql security definer set search_path = public
as $$
declare
  v_agent public.byoa_agents%rowtype;
  v_previous public.byoa_agent_credentials%rowtype;
  v_credential_id uuid;
begin
  select * into v_agent from public.byoa_agents
  where id = p_agent_id and lower(owner_wallet) = lower(p_owner_wallet)
  for update;
  if v_agent.id is null then
    return query select null::uuid, 'agent_not_found'::text;
    return;
  end if;

  select * into v_previous from public.byoa_agent_credentials
  where id = p_previous_credential_id
    and agent_id = p_agent_id
    and revoked_at is null
  for update;
  if v_previous.id is null then
    return query select null::uuid, 'credential_not_found'::text;
    return;
  end if;

  insert into public.byoa_agent_credentials (
    agent_id, label, token_prefix, credential_hash, scopes,
    expires_at, rotated_from_id
  ) values (
    p_agent_id, p_label, p_token_prefix, p_credential_hash, p_scopes,
    p_expires_at, v_previous.id
  ) returning id into v_credential_id;

  update public.byoa_agent_credentials
  set revoked_at = now()
  where id = v_previous.id and revoked_at is null;

  return query select v_credential_id, 'rotated'::text;
end;
$$;

create or replace function public.reserve_byoa_workflow_quote_v1(
  p_agent_id uuid,
  p_credential_id uuid,
  p_idempotency_hash text,
  p_request_hash text,
  p_requester_fingerprint text,
  p_workflow_type text,
  p_task text,
  p_input_preview text,
  p_input_hash text,
  p_budget_usdc numeric,
  p_planner_snapshot jsonb,
  p_selected_services jsonb,
  p_service_types text[],
  p_price_usdc numeric,
  p_amount_atomic bigint,
  p_pay_to text,
  p_expires_at timestamptz
)
returns table (quote_id uuid, created boolean, reason text)
language plpgsql security definer set search_path = public
as $$
declare
  v_agent public.byoa_agents%rowtype;
  v_credential public.byoa_agent_credentials%rowtype;
  v_policy public.byoa_agent_policies%rowtype;
  v_existing public.byoa_workflow_quotes%rowtype;
  v_quote_id uuid;
  v_spend numeric(20, 6);
  v_calls integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_agent_id::text, 2801));

  select * into v_existing from public.byoa_workflow_quotes
  where agent_id = p_agent_id and idempotency_hash = p_idempotency_hash;
  if v_existing.id is not null then
    if v_existing.request_hash <> p_request_hash then
      return query select null::uuid, false, 'idempotency_conflict'::text;
    else
      return query select v_existing.id, false, 'idempotent'::text;
    end if;
    return;
  end if;

  select * into v_agent from public.byoa_agents where id = p_agent_id for update;
  select * into v_credential from public.byoa_agent_credentials where id = p_credential_id for update;
  select * into v_policy from public.byoa_agent_policies where agent_id = p_agent_id for update;

  if v_agent.id is null or v_agent.status <> 'active' or v_agent.agent_wallet_status <> 'verified'
    or v_agent.agent_wallet is null or not v_agent.canary_enabled then
    return query select null::uuid, false, 'agent_inactive'::text; return;
  end if;
  if v_credential.id is null or v_credential.agent_id <> p_agent_id
    or v_credential.revoked_at is not null or v_credential.expires_at <= now()
    or not ('quotes:create' = any(v_credential.scopes)) then
    return query select null::uuid, false, 'credential_denied'::text; return;
  end if;
  if v_policy.agent_id is null or v_policy.status <> 'active'
    or not (p_workflow_type = any(v_policy.allowed_workflows))
    or exists (select 1 from unnest(p_service_types) value where not (value = any(v_policy.allowed_service_types)))
    or p_price_usdc > v_policy.max_price_per_run_usdc then
    return query select null::uuid, false, 'policy_denied'::text; return;
  end if;

  update public.byoa_policy_reservations
  set status = 'released', released_at = now()
  where agent_id = p_agent_id and status = 'reserved' and expires_at <= now();

  select coalesce(sum(amount_usdc), 0), coalesce(sum(call_count), 0)::integer
    into v_spend, v_calls
  from public.byoa_policy_reservations
  where agent_id = p_agent_id
    and created_at >= date_trunc('day', now())
    and (status = 'consumed' or (status = 'reserved' and expires_at > now()));

  if v_spend + p_price_usdc > v_policy.daily_spend_limit_usdc then
    return query select null::uuid, false, 'daily_spend_exceeded'::text; return;
  end if;
  if v_calls + 1 > v_policy.max_daily_calls then
    return query select null::uuid, false, 'daily_calls_exceeded'::text; return;
  end if;

  insert into public.byoa_workflow_quotes (
    agent_id, credential_id, idempotency_hash, request_hash, requester_fingerprint,
    workflow_type, task, input_preview, input_hash, budget_usdc, planner_snapshot,
    selected_services, service_types, price_usdc, amount_atomic, pay_to, expires_at
  ) values (
    p_agent_id, p_credential_id, p_idempotency_hash, p_request_hash, p_requester_fingerprint,
    p_workflow_type, p_task, p_input_preview, p_input_hash, p_budget_usdc, p_planner_snapshot,
    p_selected_services, p_service_types, p_price_usdc, p_amount_atomic, p_pay_to, p_expires_at
  ) returning id into v_quote_id;

  update public.byoa_workflow_quotes
  set resource_path = '/api/byoa/v1/quotes/' || v_quote_id::text || '/execute'
  where id = v_quote_id;

  insert into public.byoa_policy_reservations (agent_id, quote_id, amount_usdc, expires_at)
  values (p_agent_id, v_quote_id, p_price_usdc, p_expires_at);

  update public.byoa_agent_credentials set last_used_at = now() where id = p_credential_id;
  return query select v_quote_id, true, 'created'::text;
end;
$$;

create or replace function public.claim_byoa_quote_settlement_v1(
  p_quote_id uuid,
  p_credential_id uuid
)
returns table (claim_token uuid, reason text, job_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
  v_quote public.byoa_workflow_quotes%rowtype;
  v_credential public.byoa_agent_credentials%rowtype;
  v_token uuid := gen_random_uuid();
begin
  select * into v_quote from public.byoa_workflow_quotes where id = p_quote_id for update;
  if v_quote.id is null then return query select null::uuid, 'not_found'::text, null::uuid; return; end if;
  if v_quote.status in ('consumed','completed') and v_quote.job_id is not null then
    return query select null::uuid, 'idempotent'::text, v_quote.job_id; return;
  end if;
  if v_quote.status in ('credited','failed','expired','cancelled') then
    return query select null::uuid, v_quote.status, v_quote.job_id; return;
  end if;
  if v_quote.expires_at <= now() then
    update public.byoa_workflow_quotes set status = 'expired' where id = v_quote.id;
    update public.byoa_policy_reservations set status = 'released', released_at = now()
      where quote_id = v_quote.id and status = 'reserved';
    return query select null::uuid, 'expired'::text, null::uuid; return;
  end if;
  select * into v_credential from public.byoa_agent_credentials where id = p_credential_id;
  if v_credential.id is null or v_credential.agent_id <> v_quote.agent_id
    or v_credential.revoked_at is not null or v_credential.expires_at <= now()
    or not ('workflows:execute' = any(v_credential.scopes)) then
    return query select null::uuid, 'credential_denied'::text, null::uuid; return;
  end if;
  if v_quote.status = 'settling' and v_quote.settle_claim_expires_at > now() then
    return query select null::uuid, 'settlement_in_progress'::text, null::uuid; return;
  end if;
  update public.byoa_workflow_quotes
  set status = 'settling', settle_claim_token = v_token,
      settle_claim_expires_at = now() + interval '45 seconds'
  where id = v_quote.id;
  return query select v_token, 'claimed'::text, null::uuid;
end;
$$;

create or replace function public.release_byoa_quote_settlement_v1(
  p_quote_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  update public.byoa_workflow_quotes
  set status = case when expires_at > now() then 'quoted' else 'expired' end,
      settle_claim_token = null, settle_claim_expires_at = null
  where id = p_quote_id and status = 'settling' and settle_claim_token = p_claim_token
  returning id into v_id;
  if v_id is not null then
    update public.byoa_policy_reservations
    set status = 'released', released_at = now()
    where quote_id = p_quote_id and status = 'reserved'
      and expires_at <= now();
  end if;
  return v_id is not null;
end;
$$;

create or replace function public.consume_byoa_quote_v1(
  p_quote_id uuid,
  p_claim_token uuid,
  p_payment_event_id uuid
)
returns table (job_id uuid, payment_id uuid, created boolean, reason text)
language plpgsql security definer set search_path = public
as $$
declare
  v_quote public.byoa_workflow_quotes%rowtype;
  v_agent public.byoa_agents%rowtype;
  v_event public.payment_events%rowtype;
  v_payment_id uuid;
  v_job_id uuid;
  v_active_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('hosted_agent_jobs_launch_v1'));
  select * into v_quote from public.byoa_workflow_quotes where id = p_quote_id for update;
  if v_quote.id is null then return query select null::uuid, null::uuid, false, 'not_found'::text; return; end if;
  if v_quote.job_id is not null then
    select id into v_payment_id from public.byoa_workflow_payments where quote_id = v_quote.id;
    return query select v_quote.job_id, v_payment_id, false, 'idempotent'::text; return;
  end if;
  if v_quote.status <> 'settling' or v_quote.settle_claim_token <> p_claim_token
    or v_quote.settle_claim_expires_at <= now() then
    return query select null::uuid, null::uuid, false, 'claim_invalid'::text; return;
  end if;
  select * into v_agent from public.byoa_agents where id = v_quote.agent_id for update;
  select * into v_event from public.payment_events where id = p_payment_event_id for update;
  if v_agent.id is null or v_agent.status <> 'active' or v_agent.agent_wallet_status <> 'verified'
    or v_agent.agent_wallet is null or not v_agent.canary_enabled then
    return query select null::uuid, null::uuid, false, 'agent_inactive'::text; return;
  end if;
  if v_event.id is null
    or v_event.endpoint <> v_quote.resource_path
    or lower(v_event.payer) <> lower(v_agent.agent_wallet)
    or v_event.amount_usdc::numeric <> v_quote.price_usdc
    or v_event.network <> v_quote.network
    or lower(coalesce(v_event.onchain_seller, '')) <> lower(v_quote.pay_to) then
    return query select null::uuid, null::uuid, false, 'payment_mismatch'::text; return;
  end if;

  select id into v_active_id from public.hosted_agent_jobs
  where status in ('queued','running') order by created_at asc limit 1;

  insert into public.byoa_workflow_payments (
    agent_id, quote_id, payment_event_id, payer_wallet, amount_usdc,
    gateway_transaction, status
  ) values (
    v_quote.agent_id, v_quote.id, v_event.id, v_event.payer, v_quote.price_usdc,
    v_event.gateway_tx, case when v_active_id is null then 'settled' else 'credit_issued' end
  ) returning id into v_payment_id;

  if v_active_id is not null then
    insert into public.byoa_workflow_credits (payment_id, agent_id, amount_usdc, reason)
    values (v_payment_id, v_quote.agent_id, v_quote.price_usdc,
      'The project-owned downstream payer already had an active hosted workflow after aggregate x402 settlement.');
    update public.byoa_workflow_quotes
      set status = 'credited', aggregate_payment_event_id = v_event.id,
          settle_claim_token = null, settle_claim_expires_at = null, consumed_at = now()
      where id = v_quote.id;
    update public.byoa_policy_reservations set status = 'released', released_at = now()
      where quote_id = v_quote.id and status = 'reserved';
    return query select null::uuid, v_payment_id, false, 'credit_issued'::text; return;
  end if;

  insert into public.hosted_agent_jobs (
    idempotency_hash, request_hash, requester_fingerprint, requester_wallet,
    workflow_type, task, input_text, input_preview, input_hash, budget_usdc,
    planner_snapshot, selected_services, status, progress_stage, payment_mode,
    byoa_agent_id, byoa_quote_id, aggregate_payment_event_id, raw
  ) values (
    v_quote.idempotency_hash, v_quote.request_hash, v_quote.requester_fingerprint,
    v_agent.agent_wallet, v_quote.workflow_type, v_quote.task, null,
    v_quote.input_preview, v_quote.input_hash, v_quote.budget_usdc,
    v_quote.planner_snapshot, v_quote.selected_services, 'queued', 'queued', 'paid',
    v_quote.agent_id, v_quote.id, v_event.id,
    jsonb_build_object('executionMode','byoa','agentPublicId',v_agent.public_id)
  ) returning id into v_job_id;

  update public.byoa_workflow_payments set job_id = v_job_id where id = v_payment_id;
  update public.byoa_workflow_quotes
    set status = 'consumed', aggregate_payment_event_id = v_event.id, job_id = v_job_id,
        settle_claim_token = null, settle_claim_expires_at = null, consumed_at = now()
    where id = v_quote.id;
  update public.byoa_policy_reservations set status = 'consumed', consumed_at = now()
    where quote_id = v_quote.id and status = 'reserved';

  return query select v_job_id, v_payment_id, true, 'created'::text;
end;
$$;

create or replace function public.finalize_byoa_workflow_v1(
  p_job_id uuid,
  p_succeeded boolean,
  p_downstream_spent_usdc numeric,
  p_receipt_count integer,
  p_verified_proof_count integer,
  p_failure_reason text
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_payment public.byoa_workflow_payments%rowtype;
  v_quote public.byoa_workflow_quotes%rowtype;
  v_total integer;
  v_completed integer;
begin
  select * into v_payment from public.byoa_workflow_payments where job_id = p_job_id for update;
  if v_payment.id is null then return false; end if;
  if v_payment.completed_at is null then
    update public.byoa_workflow_payments
    set status = case when p_succeeded then 'completed' else 'credit_issued' end,
        downstream_spent_usdc = greatest(0, p_downstream_spent_usdc),
        receipt_count = greatest(0, p_receipt_count),
        verified_proof_count = greatest(0, p_verified_proof_count),
        failure_reason = case when p_succeeded then null else left(coalesce(p_failure_reason,'BYOA workflow failed.'),800) end,
        completed_at = now()
    where id = v_payment.id;
    select * into v_quote from public.byoa_workflow_quotes where id = v_payment.quote_id for update;
    update public.byoa_workflow_quotes set status = case when p_succeeded then 'completed' else 'credited' end
      where id = v_payment.quote_id;
    if not p_succeeded then
      insert into public.byoa_workflow_credits (payment_id, agent_id, amount_usdc, reason)
      values (v_payment.id, v_payment.agent_id, v_payment.amount_usdc,
        left(coalesce(p_failure_reason,'BYOA workflow failed after aggregate x402 settlement.'),800))
      on conflict (payment_id) do nothing;
    end if;
  end if;

  select count(*), count(*) filter (where status = 'completed')
    into v_total, v_completed
  from public.byoa_workflow_payments where agent_id = v_payment.agent_id and job_id is not null;

  insert into public.byoa_agent_passports (
    agent_id, total_workflows, completed_reports, successful_calls, verified_proofs,
    workflow_spent_usdc, downstream_spent_usdc, success_rate, last_run_at
  )
  select
    v_payment.agent_id,
    v_total,
    v_completed,
    coalesce(sum(receipt_count),0)::integer,
    coalesce(sum(verified_proof_count),0)::integer,
    coalesce(sum(amount_usdc),0),
    coalesce(sum(downstream_spent_usdc),0),
    case when v_total = 0 then 0 else round((v_completed::numeric / v_total::numeric) * 100, 4) end,
    max(completed_at)
  from public.byoa_workflow_payments where agent_id = v_payment.agent_id
  on conflict (agent_id) do update set
    total_workflows = excluded.total_workflows,
    completed_reports = excluded.completed_reports,
    successful_calls = excluded.successful_calls,
    verified_proofs = excluded.verified_proofs,
    workflow_spent_usdc = excluded.workflow_spent_usdc,
    downstream_spent_usdc = excluded.downstream_spent_usdc,
    success_rate = excluded.success_rate,
    last_run_at = excluded.last_run_at,
    updated_at = now();
  return true;
end;
$$;

revoke all on function public.consume_byoa_wallet_challenge_v1(uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.create_byoa_agent_v1(text,text,text,text) from public, anon, authenticated;
revoke all on function public.rotate_byoa_credential_v1(text,uuid,uuid,text,text,text,text[],timestamptz) from public, anon, authenticated;
revoke all on function public.reserve_byoa_workflow_quote_v1(uuid,uuid,text,text,text,text,text,text,text,numeric,jsonb,jsonb,text[],numeric,bigint,text,timestamptz) from public, anon, authenticated;
revoke all on function public.claim_byoa_quote_settlement_v1(uuid,uuid) from public, anon, authenticated;
revoke all on function public.release_byoa_quote_settlement_v1(uuid,uuid) from public, anon, authenticated;
revoke all on function public.consume_byoa_quote_v1(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.finalize_byoa_workflow_v1(uuid,boolean,numeric,integer,integer,text) from public, anon, authenticated;

grant execute on function public.consume_byoa_wallet_challenge_v1(uuid,text,text,text,text) to service_role;
grant execute on function public.create_byoa_agent_v1(text,text,text,text) to service_role;
grant execute on function public.rotate_byoa_credential_v1(text,uuid,uuid,text,text,text,text[],timestamptz) to service_role;
grant execute on function public.reserve_byoa_workflow_quote_v1(uuid,uuid,text,text,text,text,text,text,text,numeric,jsonb,jsonb,text[],numeric,bigint,text,timestamptz) to service_role;
grant execute on function public.claim_byoa_quote_settlement_v1(uuid,uuid) to service_role;
grant execute on function public.release_byoa_quote_settlement_v1(uuid,uuid) to service_role;
grant execute on function public.consume_byoa_quote_v1(uuid,uuid,uuid) to service_role;
grant execute on function public.finalize_byoa_workflow_v1(uuid,boolean,numeric,integer,integer,text) to service_role;

comment on table public.byoa_agent_credentials is
  'Only one-way credential hashes and non-secret prefixes are persisted; plaintext API credentials are returned once.';
comment on table public.byoa_wallet_challenges is
  'One-time Arc Testnet wallet challenges bound to origin, action, wallet, chain and expiry.';
comment on table public.byoa_workflow_payments is
  'Aggregate external-agent x402 workflow payments, separate from project-owned downstream x402 purchases.';
