-- P4.3: immutable Project 360 monitoring configurations, rechecks, snapshots,
-- suggestions, and integration with the existing trust alert/profile plane.

begin;

alter table public.trust_profiles
  drop constraint if exists trust_profiles_subject_type_check;
alter table public.trust_profiles
  add constraint trust_profiles_subject_type_check check (
    subject_type in (
      'github_repository', 'ai_agent', 'wallet', 'arc_contract',
      'service_endpoint', 'project_360'
    )
  );

create table if not exists public.project_360_monitors (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique
    default ('p3m_' || encode(extensions.gen_random_bytes(10), 'hex'))
    check (public_id ~ '^p3m_[0-9a-f]{20}$'),
  owner_wallet text not null check (owner_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  profile_id uuid not null references public.trust_profiles(id) on delete restrict,
  label text not null check (char_length(label) between 2 and 100),
  baseline_quote_id uuid not null
    references public.hosted_workflow_quotes(id) on delete restrict,
  baseline_job_id uuid not null
    references public.hosted_agent_jobs(id) on delete restrict,
  configuration_hash text not null check (configuration_hash ~ '^[0-9a-f]{64}$'),
  project_input jsonb not null check (jsonb_typeof(project_input) = 'object'),
  selected_modules text[] not null check (
    cardinality(selected_modules) between 1 and 5
    and selected_modules <@ array[
      'github_due_diligence', 'agent_trust_report', 'treasury_health',
      'paid_api_quality', 'arc_contract_analysis'
    ]::text[]
  ),
  source_value_hashes text[] not null check (
    cardinality(source_value_hashes) = cardinality(selected_modules)
  ),
  selected_candidates_snapshot jsonb not null check (
    jsonb_typeof(selected_candidates_snapshot) = 'array'
    and jsonb_array_length(selected_candidates_snapshot) = cardinality(selected_modules)
  ),
  cadence text not null default 'manual' check (cadence in ('manual', 'daily', 'weekly')),
  status text not null default 'active' check (status in ('active', 'paused')),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  next_recheck_at timestamptz,
  last_recheck_at timestamptz,
  last_snapshot_id uuid,
  last_job_id uuid references public.hosted_agent_jobs(id) on delete set null,
  last_error_code text check (
    last_error_code is null or last_error_code ~ '^[a-z0-9_]{3,80}$'
  ),
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (cadence = 'manual' and next_recheck_at is null)
    or cadence in ('daily', 'weekly')
  ),
  unique (baseline_job_id)
);

create unique index if not exists project_360_monitors_owner_profile_uidx
  on public.project_360_monitors (lower(owner_wallet), profile_id);
create index if not exists project_360_monitors_owner_created_idx
  on public.project_360_monitors (lower(owner_wallet), created_at desc);
create index if not exists project_360_monitors_due_idx
  on public.project_360_monitors (next_recheck_at asc)
  where status = 'active' and cadence in ('daily', 'weekly')
    and next_recheck_at is not null;
create index if not exists project_360_monitors_public_profile_idx
  on public.project_360_monitors (profile_id, last_recheck_at desc, created_at desc)
  where visibility = 'public';

create table if not exists public.project_360_monitor_rechecks (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique
    default ('pmr_' || encode(extensions.gen_random_bytes(10), 'hex'))
    check (public_id ~ '^pmr_[0-9a-f]{20}$'),
  monitor_id uuid not null references public.project_360_monitors(id) on delete cascade,
  trigger text not null check (trigger in ('baseline', 'manual', 'scheduled', 'machine')),
  status text not null default 'quoted' check (
    status in ('quoted', 'queued', 'running', 'completed', 'failed', 'cancelled')
  ),
  idempotency_hash text not null check (idempotency_hash ~ '^[0-9a-f]{64}$'),
  configuration_hash text not null check (configuration_hash ~ '^[0-9a-f]{64}$'),
  quote_id uuid references public.hosted_workflow_quotes(id) on delete set null,
  job_id uuid references public.hosted_agent_jobs(id) on delete set null,
  scheduled_for timestamptz,
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_]{3,80}$'),
  error_message text check (error_message is null or char_length(error_message) <= 300),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (monitor_id, idempotency_hash),
  unique (quote_id),
  unique (job_id)
);

create index if not exists project_360_monitor_rechecks_monitor_created_idx
  on public.project_360_monitor_rechecks (monitor_id, created_at desc);
create index if not exists project_360_monitor_rechecks_active_idx
  on public.project_360_monitor_rechecks (status, updated_at)
  where status in ('quoted', 'queued', 'running');

create table if not exists public.project_360_monitor_snapshots (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique
    default ('pms_' || encode(extensions.gen_random_bytes(10), 'hex'))
    check (public_id ~ '^pms_[0-9a-f]{20}$'),
  monitor_id uuid not null references public.project_360_monitors(id) on delete cascade,
  recheck_id uuid not null unique
    references public.project_360_monitor_rechecks(id) on delete cascade,
  job_id uuid not null unique references public.hosted_agent_jobs(id) on delete restrict,
  sequence_number integer not null check (sequence_number > 0),
  project_trust_score integer check (project_trust_score between 0 and 100),
  confidence_percent integer not null check (confidence_percent between 0 and 100),
  verdict text not null check (
    verdict in ('strong_signals', 'review_recommended', 'high_attention', 'limited_data')
  ),
  coverage_status text not null check (
    coverage_status in ('complete', 'partial', 'limited', 'failed')
  ),
  completed_modules integer not null check (completed_modules between 0 and 5),
  selected_modules integer not null check (selected_modules between 1 and 5),
  report_hash text not null check (report_hash ~ '^0x[0-9a-fA-F]{64}$'),
  verification_status text not null check (
    verification_status in ('verified', 'verification_pending', 'verification_failed')
  ),
  proof_transaction_hash text check (
    proof_transaction_hash is null or proof_transaction_hash ~ '^0x[0-9a-fA-F]{64}$'
  ),
  report_snapshot jsonb not null check (jsonb_typeof(report_snapshot) = 'object'),
  delta_snapshot jsonb not null check (jsonb_typeof(delta_snapshot) = 'object'),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (monitor_id, sequence_number)
);

alter table public.project_360_monitors
  drop constraint if exists project_360_monitors_last_snapshot_id_fkey;
alter table public.project_360_monitors
  add constraint project_360_monitors_last_snapshot_id_fkey
  foreign key (last_snapshot_id)
  references public.project_360_monitor_snapshots(id) on delete set null;

create index if not exists project_360_monitor_snapshots_history_idx
  on public.project_360_monitor_snapshots (monitor_id, sequence_number desc);
create index if not exists project_360_monitor_snapshots_score_idx
  on public.project_360_monitor_snapshots (
    monitor_id, observed_at desc, project_trust_score
  );

create table if not exists public.project_360_monitor_suggestions (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique
    default ('psg_' || encode(extensions.gen_random_bytes(10), 'hex'))
    check (public_id ~ '^psg_[0-9a-f]{20}$'),
  monitor_id uuid not null references public.project_360_monitors(id) on delete cascade,
  discovery_id uuid not null
    references public.project_360_discoveries(id) on delete cascade,
  candidate_id uuid not null
    references public.project_360_candidates(id) on delete cascade,
  module text not null check (
    module in (
      'github_due_diligence', 'agent_trust_report', 'treasury_health',
      'paid_api_quality', 'arc_contract_analysis'
    )
  ),
  source_type text not null check (
    source_type in (
      'github_repository', 'project_wallet', 'agent_id',
      'arc_contract', 'public_api_endpoint'
    )
  ),
  value_hash text not null check (value_hash ~ '^[0-9a-f]{64}$'),
  candidate_snapshot jsonb not null check (jsonb_typeof(candidate_snapshot) = 'object'),
  status text not null default 'pending' check (
    status in ('pending', 'dismissed', 'superseded')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (monitor_id, module, value_hash)
);

create index if not exists project_360_monitor_suggestions_pending_idx
  on public.project_360_monitor_suggestions (monitor_id, created_at desc)
  where status = 'pending';

alter table public.trust_alert_events
  add column if not exists project_360_snapshot_id uuid
  references public.project_360_monitor_snapshots(id) on delete cascade;
alter table public.trust_alert_events
  drop constraint if exists trust_alert_events_single_snapshot_check;
alter table public.trust_alert_events
  add constraint trust_alert_events_single_snapshot_check check (
    num_nonnulls(snapshot_id, project_360_snapshot_id) <= 1
  );
create index if not exists trust_alert_events_project_360_snapshot_idx
  on public.trust_alert_events (project_360_snapshot_id)
  where project_360_snapshot_id is not null;

create or replace function public.prevent_project_360_monitor_config_change_v1()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.profile_id <> old.profile_id
    or new.baseline_quote_id <> old.baseline_quote_id
    or new.baseline_job_id <> old.baseline_job_id
    or new.configuration_hash <> old.configuration_hash
    or new.project_input <> old.project_input
    or new.selected_modules <> old.selected_modules
    or new.source_value_hashes <> old.source_value_hashes
    or new.selected_candidates_snapshot <> old.selected_candidates_snapshot
  then
    raise exception 'project_360_monitor_configuration_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_project_360_monitor_config_change
  on public.project_360_monitors;
create trigger prevent_project_360_monitor_config_change
  before update on public.project_360_monitors
  for each row execute function public.prevent_project_360_monitor_config_change_v1();

drop trigger if exists set_project_360_monitors_updated_at
  on public.project_360_monitors;
create trigger set_project_360_monitors_updated_at
  before update on public.project_360_monitors
  for each row execute function public.set_trust_monitoring_updated_at();
drop trigger if exists set_project_360_monitor_rechecks_updated_at
  on public.project_360_monitor_rechecks;
create trigger set_project_360_monitor_rechecks_updated_at
  before update on public.project_360_monitor_rechecks
  for each row execute function public.set_trust_monitoring_updated_at();
drop trigger if exists set_project_360_monitor_suggestions_updated_at
  on public.project_360_monitor_suggestions;
create trigger set_project_360_monitor_suggestions_updated_at
  before update on public.project_360_monitor_suggestions
  for each row execute function public.set_trust_monitoring_updated_at();

create or replace function public.claim_due_project_360_monitors_v1(p_limit integer)
returns setof public.project_360_monitors
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select monitor.id
    from public.project_360_monitors monitor
    where monitor.status = 'active'
      and monitor.cadence in ('daily', 'weekly')
      and monitor.next_recheck_at is not null
      and monitor.next_recheck_at <= now()
      and not exists (
        select 1 from public.project_360_monitor_rechecks recheck
        where recheck.monitor_id = monitor.id
          and recheck.status in ('quoted', 'queued', 'running')
      )
    order by monitor.next_recheck_at asc
    for update skip locked
    limit greatest(0, least(coalesce(p_limit, 0), 3))
  )
  update public.project_360_monitors monitor
  set next_recheck_at = case
        when monitor.cadence = 'daily' then now() + interval '1 day'
        else now() + interval '7 days'
      end,
      last_error_code = null,
      last_error_at = null
  from due where monitor.id = due.id
  returning monitor.*;
end;
$$;

create or replace function public.launch_project_360_monitoring_checkout_v1(
  p_quote_id uuid,
  p_recheck_id uuid
)
returns table (job_id uuid, user_payment_id uuid, created boolean, reason text)
language plpgsql security definer set search_path = public as $$
declare
  v_quote public.hosted_workflow_quotes%rowtype;
  v_recheck public.project_360_monitor_rechecks%rowtype;
  v_monitor public.project_360_monitors%rowtype;
  v_mapping public.project_360_quotes%rowtype;
  v_project_input jsonb;
  v_metadata jsonb;
  v_modules text[];
  v_source_hashes text[];
  v_active_id uuid;
  v_payment_id uuid;
  v_job_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('hosted_agent_jobs_launch_v1'));
  select * into v_quote from public.hosted_workflow_quotes
    where id = p_quote_id for update;
  select * into v_recheck from public.project_360_monitor_rechecks
    where id = p_recheck_id for update;
  if v_quote.id is null or v_recheck.id is null then
    return query select null::uuid, null::uuid, false, 'not_found'::text;
    return;
  end if;
  select * into v_monitor from public.project_360_monitors
    where id = v_recheck.monitor_id for update;
  select * into v_mapping from public.project_360_quotes
    where quote_id = v_quote.id;
  v_metadata := coalesce(v_quote.planner_snapshot -> 'metadata', '{}'::jsonb);
  v_project_input := v_quote.planner_snapshot -> 'metadata' -> 'project360Input';
  select array_agg(value order by value)
    into v_modules
    from jsonb_array_elements_text(v_project_input -> 'modules') value;
  select array_agg(
      source ->> 'valueHash'
      order by array_position(
        array[
          'github_due_diligence', 'agent_trust_report', 'treasury_health',
          'paid_api_quality', 'arc_contract_analysis'
        ]::text[],
        source ->> 'module'
      )
    )
    into v_source_hashes
    from jsonb_array_elements(v_project_input -> 'sources') source;

  if v_monitor.id is null
    or v_recheck.trigger <> 'scheduled'
    or v_recheck.quote_id <> v_quote.id
    or v_recheck.configuration_hash <> v_monitor.configuration_hash
    or v_quote.workflow_type <> 'project_360'
    or v_quote.payment_mode <> 'sponsored'
    or lower(v_quote.requester_wallet) <> lower(v_monitor.owner_wallet)
    or v_metadata ->> 'monitoringWatchlistId' <> v_monitor.id::text
    or v_metadata ->> 'monitoringRecheckId' <> v_recheck.id::text
    or v_mapping.quote_id is null
    or v_mapping.expected_coverage_count <> cardinality(v_monitor.selected_modules)
    or v_modules <> (select array_agg(value order by value) from unnest(v_monitor.selected_modules) value)
    or v_source_hashes <> v_monitor.source_value_hashes
  then
    return query select null::uuid, null::uuid, false, 'policy_denied'::text;
    return;
  end if;

  if v_quote.job_id is not null and v_quote.user_payment_id is not null then
    return query select v_quote.job_id, v_quote.user_payment_id, false, 'idempotent'::text;
    return;
  end if;
  if v_monitor.status <> 'active'
    or v_monitor.cadence not in ('daily', 'weekly')
    or v_recheck.status <> 'quoted'
    or v_quote.status <> 'quoted'
    or now() > v_quote.expires_at
  then
    return query select null::uuid, null::uuid, false, 'policy_denied'::text;
    return;
  end if;
  select id into v_active_id from public.hosted_agent_jobs
    where status in ('queued', 'running') order by created_at asc limit 1;
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
      'project360MonitorRecheckId', v_recheck.id,
      'project360MonitorId', v_monitor.id,
      'sponsorship', 'scheduled_monitoring'
    )
  ) returning id into v_job_id;
  update public.hosted_workflow_user_payments set job_id = v_job_id
    where id = v_payment_id;
  update public.hosted_workflow_quotes
    set status = 'consumed', job_id = v_job_id, user_payment_id = v_payment_id,
        consumed_at = now()
    where id = v_quote.id;
  update public.project_360_monitor_rechecks
    set status = 'queued', job_id = v_job_id, started_at = now()
    where id = v_recheck.id;
  update public.project_360_monitors
    set last_recheck_at = now(), last_job_id = v_job_id
    where id = v_monitor.id;
  return query select v_job_id, v_payment_id, true, 'created'::text;
end;
$$;

revoke all on function public.prevent_project_360_monitor_config_change_v1()
  from public, anon, authenticated;
revoke all on function public.claim_due_project_360_monitors_v1(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_project_360_monitors_v1(integer)
  to service_role;
revoke all on function public.launch_project_360_monitoring_checkout_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.launch_project_360_monitoring_checkout_v1(uuid, uuid)
  to service_role;

alter table public.project_360_monitors enable row level security;
alter table public.project_360_monitor_rechecks enable row level security;
alter table public.project_360_monitor_snapshots enable row level security;
alter table public.project_360_monitor_suggestions enable row level security;
revoke all on table public.project_360_monitors from anon, authenticated;
revoke all on table public.project_360_monitor_rechecks from anon, authenticated;
revoke all on table public.project_360_monitor_snapshots from anon, authenticated;
revoke all on table public.project_360_monitor_suggestions from anon, authenticated;
grant all on table public.project_360_monitors to service_role;
grant all on table public.project_360_monitor_rechecks to service_role;
grant all on table public.project_360_monitor_snapshots to service_role;
grant all on table public.project_360_monitor_suggestions to service_role;

drop policy if exists "Allow service access" on public.project_360_monitors;
create policy "Allow service access" on public.project_360_monitors
  for all to service_role using (true) with check (true);
drop policy if exists "Allow service access" on public.project_360_monitor_rechecks;
create policy "Allow service access" on public.project_360_monitor_rechecks
  for all to service_role using (true) with check (true);
drop policy if exists "Allow service access" on public.project_360_monitor_snapshots;
create policy "Allow service access" on public.project_360_monitor_snapshots
  for all to service_role using (true) with check (true);
drop policy if exists "Allow service access" on public.project_360_monitor_suggestions;
create policy "Allow service access" on public.project_360_monitor_suggestions
  for all to service_role using (true) with check (true);

comment on table public.project_360_monitors is
  'Owner-controlled immutable Project 360 source/module configurations.';
comment on table public.project_360_monitor_suggestions is
  'Free rediscovery candidates that never alter a paid monitoring execution automatically.';

commit;
