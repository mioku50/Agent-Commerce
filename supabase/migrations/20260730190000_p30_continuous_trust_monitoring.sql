-- P3.0: tenant-scoped continuous trust monitoring.
-- Public history is served through redacted application routes; direct database
-- access remains service-role only.

alter table public.hosted_workflow_user_payments
  add column if not exists sponsorship_source text not null default 'user_quota';
alter table public.hosted_workflow_user_payments
  drop constraint if exists hosted_workflow_user_payments_sponsorship_source_check;
alter table public.hosted_workflow_user_payments
  add constraint hosted_workflow_user_payments_sponsorship_source_check
  check (sponsorship_source in ('user_quota', 'scheduled_monitoring'));

create table if not exists public.trust_watchlists (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique
    default ('wtl_' || encode(extensions.gen_random_bytes(10), 'hex'))
    check (public_id ~ '^wtl_[0-9a-f]{20}$'),
  owner_wallet text not null
    check (owner_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  label text not null check (char_length(label) between 2 and 100),
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  subject_input jsonb not null check (jsonb_typeof(subject_input) = 'object'),
  cadence text not null default 'manual'
    check (cadence in ('manual', 'daily', 'weekly')),
  status text not null default 'active'
    check (status in ('active', 'paused')),
  next_recheck_at timestamptz,
  last_recheck_at timestamptz,
  last_snapshot_id uuid,
  last_job_id uuid references public.hosted_agent_jobs(id) on delete set null,
  last_error_code text
    check (last_error_code is null or last_error_code ~ '^[a-z0-9_]{3,80}$'),
  last_error_at timestamptz,
  byoa_agent_id uuid references public.byoa_agents(id) on delete set null,
  machine_credential_id uuid references public.byoa_agent_credentials(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (cadence = 'manual' and next_recheck_at is null)
    or cadence in ('daily', 'weekly')
  ),
  check (
    (machine_credential_id is null and byoa_agent_id is null)
    or (machine_credential_id is not null and byoa_agent_id is not null)
  )
);

create unique index if not exists trust_watchlists_owner_subject_tenant_idx
  on public.trust_watchlists (
    lower(owner_wallet),
    subject_hash,
    coalesce(machine_credential_id::text, '')
  );
create index if not exists trust_watchlists_owner_created_idx
  on public.trust_watchlists (lower(owner_wallet), created_at desc);
create index if not exists trust_watchlists_due_idx
  on public.trust_watchlists (next_recheck_at asc)
  where status = 'active'
    and cadence in ('daily', 'weekly')
    and next_recheck_at is not null;
create index if not exists trust_watchlists_machine_tenant_idx
  on public.trust_watchlists (byoa_agent_id, machine_credential_id, created_at desc)
  where machine_credential_id is not null;

create table if not exists public.trust_monitoring_rechecks (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique
    default ('trc_' || encode(extensions.gen_random_bytes(10), 'hex'))
    check (public_id ~ '^trc_[0-9a-f]{20}$'),
  watchlist_id uuid not null
    references public.trust_watchlists(id) on delete cascade,
  trigger text not null check (trigger in ('manual', 'scheduled', 'machine')),
  status text not null default 'quoted'
    check (status in ('quoted', 'queued', 'running', 'completed', 'failed', 'cancelled')),
  idempotency_hash text not null check (idempotency_hash ~ '^[0-9a-f]{64}$'),
  quote_id uuid references public.hosted_workflow_quotes(id) on delete set null,
  job_id uuid references public.hosted_agent_jobs(id) on delete set null,
  byoa_agent_id uuid references public.byoa_agents(id) on delete set null,
  machine_credential_id uuid references public.byoa_agent_credentials(id) on delete set null,
  scheduled_for timestamptz,
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_]{3,80}$'),
  error_message text check (error_message is null or char_length(error_message) <= 300),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (watchlist_id, idempotency_hash),
  unique (quote_id),
  unique (job_id),
  check (
    (trigger = 'machine' and byoa_agent_id is not null and machine_credential_id is not null)
    or trigger <> 'machine'
  )
);

create index if not exists trust_monitoring_rechecks_watchlist_created_idx
  on public.trust_monitoring_rechecks (watchlist_id, created_at desc);
create index if not exists trust_monitoring_rechecks_machine_tenant_idx
  on public.trust_monitoring_rechecks (
    byoa_agent_id,
    machine_credential_id,
    created_at desc
  )
  where machine_credential_id is not null;
create index if not exists trust_monitoring_rechecks_active_idx
  on public.trust_monitoring_rechecks (status, updated_at)
  where status in ('quoted', 'queued', 'running');

create table if not exists public.trust_monitoring_snapshots (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique
    default ('tms_' || encode(extensions.gen_random_bytes(10), 'hex'))
    check (public_id ~ '^tms_[0-9a-f]{20}$'),
  watchlist_id uuid not null
    references public.trust_watchlists(id) on delete cascade,
  recheck_id uuid not null unique
    references public.trust_monitoring_rechecks(id) on delete cascade,
  job_id uuid not null unique
    references public.hosted_agent_jobs(id) on delete restrict,
  sequence_number integer not null check (sequence_number > 0),
  trust_score integer check (trust_score between 0 and 100),
  trust_status text not null check (
    trust_status in (
      'strong_signals', 'review_recommended', 'high_attention', 'limited_data'
    )
  ),
  report_hash text not null check (report_hash ~ '^0x[0-9a-fA-F]{64}$'),
  verification_status text not null check (
    verification_status in ('verified', 'verification_pending', 'verification_failed')
  ),
  proof_transaction_hash text
    check (
      proof_transaction_hash is null
      or proof_transaction_hash ~ '^0x[0-9a-fA-F]{64}$'
    ),
  report_snapshot jsonb not null check (jsonb_typeof(report_snapshot) = 'object'),
  delta_snapshot jsonb not null check (jsonb_typeof(delta_snapshot) = 'object'),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (watchlist_id, sequence_number)
);

alter table public.trust_watchlists
  drop constraint if exists trust_watchlists_last_snapshot_id_fkey;
alter table public.trust_watchlists
  add constraint trust_watchlists_last_snapshot_id_fkey
  foreign key (last_snapshot_id)
  references public.trust_monitoring_snapshots(id)
  on delete set null;

create index if not exists trust_monitoring_snapshots_watchlist_sequence_idx
  on public.trust_monitoring_snapshots (watchlist_id, sequence_number desc);
create index if not exists trust_monitoring_snapshots_score_history_idx
  on public.trust_monitoring_snapshots (watchlist_id, observed_at desc, trust_score);

create or replace function public.set_trust_monitoring_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_trust_watchlists_updated_at on public.trust_watchlists;
create trigger set_trust_watchlists_updated_at
  before update on public.trust_watchlists
  for each row execute function public.set_trust_monitoring_updated_at();

drop trigger if exists set_trust_monitoring_rechecks_updated_at
  on public.trust_monitoring_rechecks;
create trigger set_trust_monitoring_rechecks_updated_at
  before update on public.trust_monitoring_rechecks
  for each row execute function public.set_trust_monitoring_updated_at();

create or replace function public.claim_due_trust_watchlists_v1(p_limit integer)
returns setof public.trust_watchlists
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select watchlist.id
    from public.trust_watchlists watchlist
    where watchlist.status = 'active'
      and watchlist.cadence in ('daily', 'weekly')
      and watchlist.next_recheck_at is not null
      and watchlist.next_recheck_at <= now()
      and not exists (
        select 1
        from public.trust_monitoring_rechecks recheck
        where recheck.watchlist_id = watchlist.id
          and recheck.status in ('quoted', 'queued', 'running')
      )
    order by watchlist.next_recheck_at asc
    for update skip locked
    -- A zero limit is an intentional no-op used by production schema
    -- verification to prove the RPC exists without claiming customer work.
    limit greatest(0, least(coalesce(p_limit, 0), 3))
  )
  update public.trust_watchlists watchlist
  set next_recheck_at = case
        when watchlist.cadence = 'daily' then now() + interval '1 day'
        else now() + interval '7 days'
      end,
      last_error_code = null,
      last_error_at = null
  from due
  where watchlist.id = due.id
  returning watchlist.*;
end;
$$;

create or replace function public.launch_trust_monitoring_checkout_v1(
  p_quote_id uuid,
  p_recheck_id uuid
)
returns table (
  job_id uuid,
  user_payment_id uuid,
  created boolean,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.hosted_workflow_quotes%rowtype;
  v_recheck public.trust_monitoring_rechecks%rowtype;
  v_watchlist public.trust_watchlists%rowtype;
  v_active_id uuid;
  v_payment_id uuid;
  v_job_id uuid;
  v_metadata jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('hosted_agent_jobs_launch_v1'));

  select * into v_quote
  from public.hosted_workflow_quotes
  where id = p_quote_id
  for update;
  select * into v_recheck
  from public.trust_monitoring_rechecks
  where id = p_recheck_id
  for update;

  if v_quote.id is null or v_recheck.id is null then
    return query select null::uuid, null::uuid, false, 'not_found'::text;
    return;
  end if;
  select * into v_watchlist
  from public.trust_watchlists
  where id = v_recheck.watchlist_id
  for update;
  v_metadata := coalesce(v_quote.planner_snapshot -> 'metadata', '{}'::jsonb);

  if v_watchlist.id is null
    or v_watchlist.status <> 'active'
    or v_watchlist.cadence not in ('daily', 'weekly')
    or v_recheck.trigger <> 'scheduled'
    or v_recheck.status <> 'quoted'
    or v_recheck.quote_id <> v_quote.id
    or v_quote.workflow_type <> 'agent_trust_report'
    or v_quote.payment_mode <> 'sponsored'
    or v_quote.status <> 'quoted'
    or now() > v_quote.expires_at
    or lower(v_quote.requester_wallet) <> lower(v_watchlist.owner_wallet)
    or v_metadata ->> 'monitoringRecheckId' <> v_recheck.id::text
    or v_metadata ->> 'monitoringWatchlistId' <> v_watchlist.id::text
  then
    return query select null::uuid, null::uuid, false, 'policy_denied'::text;
    return;
  end if;

  if v_quote.job_id is not null and v_quote.user_payment_id is not null then
    return query select v_quote.job_id, v_quote.user_payment_id, false, 'idempotent'::text;
    return;
  end if;

  select id into v_active_id
  from public.hosted_agent_jobs
  where status in ('queued', 'running')
  order by created_at asc
  limit 1;
  if v_active_id is not null then
    return query select null::uuid, null::uuid, false, 'active_job'::text;
    return;
  end if;

  insert into public.hosted_workflow_user_payments (
    quote_id, requester_wallet, payment_mode, status, gross_amount_usdc,
    estimated_provider_cost_usdc, provider_cost_usdc, platform_fee_usdc,
    net_revenue_usdc, credit_amount_usdc, chain_id, asset, treasury_address,
    transaction_hash, block_number, settled_at, sponsorship_source
  ) values (
    v_quote.id, v_quote.treasury_address, 'sponsored', 'sponsored', 0,
    v_quote.estimated_provider_cost_usdc, 0, 0, 0, 0,
    v_quote.chain_id, v_quote.asset, v_quote.treasury_address,
    null, null, now(), 'scheduled_monitoring'
  ) returning id into v_payment_id;

  insert into public.hosted_agent_jobs (
    idempotency_hash, request_hash, requester_fingerprint, requester_wallet,
    workflow_type, task, input_text, input_preview, input_hash, budget_usdc,
    planner_snapshot, selected_services, status, progress_stage,
    workflow_quote_id, user_payment_id, payment_mode, raw
  ) values (
    v_quote.idempotency_hash, v_quote.request_hash, v_quote.requester_fingerprint,
    v_quote.requester_wallet, v_quote.workflow_type, v_quote.task, null,
    v_quote.input_preview, v_quote.input_hash, v_quote.budget_usdc,
    v_quote.planner_snapshot, v_quote.selected_services, 'queued', 'queued',
    v_quote.id, v_payment_id, 'sponsored',
    jsonb_build_object(
      'checkoutQuoteId', v_quote.id,
      'userPaymentId', v_payment_id,
      'monitoringRecheckId', v_recheck.id,
      'monitoringWatchlistId', v_watchlist.id,
      'sponsorship', 'scheduled_monitoring'
    )
  ) returning id into v_job_id;

  update public.hosted_workflow_user_payments
  set job_id = v_job_id
  where id = v_payment_id;
  update public.hosted_workflow_quotes
  set status = 'consumed',
      job_id = v_job_id,
      user_payment_id = v_payment_id,
      consumed_at = now()
  where id = v_quote.id;
  update public.trust_monitoring_rechecks
  set status = 'queued',
      job_id = v_job_id,
      started_at = now()
  where id = v_recheck.id;
  update public.trust_watchlists
  set last_recheck_at = now(),
      last_job_id = v_job_id
  where id = v_watchlist.id;

  return query select v_job_id, v_payment_id, true, 'created'::text;
end;
$$;

revoke all on function public.claim_due_trust_watchlists_v1(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_trust_watchlists_v1(integer)
  to service_role;
revoke all on function public.launch_trust_monitoring_checkout_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.launch_trust_monitoring_checkout_v1(uuid, uuid)
  to service_role;

alter table public.trust_watchlists enable row level security;
alter table public.trust_monitoring_rechecks enable row level security;
alter table public.trust_monitoring_snapshots enable row level security;

revoke all on table public.trust_watchlists from anon, authenticated;
revoke all on table public.trust_monitoring_rechecks from anon, authenticated;
revoke all on table public.trust_monitoring_snapshots from anon, authenticated;
grant all on table public.trust_watchlists to service_role;
grant all on table public.trust_monitoring_rechecks to service_role;
grant all on table public.trust_monitoring_snapshots to service_role;

drop policy if exists "Allow service access" on public.trust_watchlists;
create policy "Allow service access" on public.trust_watchlists
  for all to service_role using (true) with check (true);
drop policy if exists "Allow service access" on public.trust_monitoring_rechecks;
create policy "Allow service access" on public.trust_monitoring_rechecks
  for all to service_role using (true) with check (true);
drop policy if exists "Allow service access" on public.trust_monitoring_snapshots;
create policy "Allow service access" on public.trust_monitoring_snapshots
  for all to service_role using (true) with check (true);

comment on table public.trust_watchlists is
  'Owner-wallet watchlists of public Agent Trust Report subjects with manual, daily, or weekly cadence.';
comment on table public.trust_monitoring_rechecks is
  'Idempotent watchlist recheck lifecycle linked to an immutable workflow quote and hosted job.';
comment on table public.trust_monitoring_snapshots is
  'Append-only canonical Agent Trust Reports, deterministic deltas, and exact Arc proof references.';
comment on column public.hosted_workflow_user_payments.sponsorship_source is
  'Distinguishes owner quota sponsorship from capped platform-funded scheduled monitoring.';
