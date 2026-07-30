-- P3.2/P3.3: tenant-scoped trust alerts, signed webhook delivery, and
-- opt-in Machine API permissions. Public badge/status routes continue to read
-- only the existing public trust projection.

alter table public.byoa_agent_credentials
  drop constraint if exists byoa_agent_credentials_scopes_check;

alter table public.byoa_agent_credentials
  add constraint byoa_agent_credentials_scopes_check
  check (
    (
      credential_type = 'byoa_workflow'
      and cardinality(scopes) = 4
      and scopes <@ array[
        'manifest:read',
        'quotes:create',
        'workflows:execute',
        'results:read'
      ]::text[]
      and array[
        'manifest:read',
        'quotes:create',
        'workflows:execute',
        'results:read'
      ]::text[] <@ scopes
    )
    or
    (
      credential_type = 'machine_api'
      and cardinality(scopes) between 4 and 8
      and array[
        'workflows:read',
        'quotes:create',
        'runs:create',
        'results:read'
      ]::text[] <@ scopes
      and scopes <@ array[
        'workflows:read',
        'quotes:create',
        'runs:create',
        'results:read',
        'alerts:read',
        'alerts:write',
        'webhooks:read',
        'webhooks:write'
      ]::text[]
    )
  );

create table if not exists public.trust_alert_events (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique
    default ('evt_' || encode(extensions.gen_random_bytes(12), 'hex'))
    check (public_id ~ '^evt_[0-9a-f]{24}$'),
  owner_wallet text not null
    check (owner_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  profile_id uuid not null references public.trust_profiles(id) on delete cascade,
  snapshot_id uuid references public.trust_monitoring_snapshots(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'trust_score_changed',
      'trust_status_changed',
      'risk_added',
      'risk_resolved',
      'verification_failed',
      'recheck_failed',
      'subject_unavailable'
    )
  ),
  event_fingerprint text not null check (event_fingerprint ~ '^[0-9a-f]{64}$'),
  message text not null check (char_length(message) between 3 and 300),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  byoa_agent_id uuid references public.byoa_agents(id) on delete set null,
  machine_credential_id uuid references public.byoa_agent_credentials(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (profile_id, snapshot_id, event_type, event_fingerprint),
  unique (profile_id, event_type, event_fingerprint),
  check (
    (machine_credential_id is null and byoa_agent_id is null)
    or (machine_credential_id is not null and byoa_agent_id is not null)
  )
);

create index if not exists trust_alert_events_owner_created_idx
  on public.trust_alert_events (lower(owner_wallet), created_at desc);
create index if not exists trust_alert_events_machine_created_idx
  on public.trust_alert_events (
    byoa_agent_id,
    machine_credential_id,
    created_at desc
  )
  where machine_credential_id is not null;
create index if not exists trust_alert_events_profile_created_idx
  on public.trust_alert_events (profile_id, created_at desc);

create table if not exists public.trust_alert_states (
  alert_event_id uuid not null
    references public.trust_alert_events(id) on delete cascade,
  owner_wallet text not null
    check (owner_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  state text not null default 'unread'
    check (state in ('unread', 'read', 'archived')),
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (alert_event_id, owner_wallet)
);

create index if not exists trust_alert_states_owner_state_idx
  on public.trust_alert_states (lower(owner_wallet), state, updated_at desc);

create table if not exists public.webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique
    default ('whk_' || encode(extensions.gen_random_bytes(12), 'hex'))
    check (public_id ~ '^whk_[0-9a-f]{24}$'),
  owner_wallet text not null
    check (owner_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  name text not null check (char_length(name) between 2 and 80),
  endpoint_url text not null check (char_length(endpoint_url) between 12 and 2048),
  endpoint_domain text not null check (char_length(endpoint_domain) between 1 and 253),
  profile_ids uuid[] not null check (cardinality(profile_ids) between 1 and 10),
  event_types text[] not null check (
    cardinality(event_types) between 1 and 7
    and event_types <@ array[
      'trust_score_changed',
      'trust_status_changed',
      'risk_added',
      'risk_resolved',
      'verification_failed',
      'recheck_failed',
      'subject_unavailable'
    ]::text[]
  ),
  status text not null default 'active' check (status in ('active', 'paused')),
  secret_ciphertext text not null,
  previous_secret_ciphertext text,
  previous_secret_expires_at timestamptz,
  byoa_agent_id uuid references public.byoa_agents(id) on delete set null,
  machine_credential_id uuid references public.byoa_agent_credentials(id) on delete set null,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (machine_credential_id is null and byoa_agent_id is null)
    or (machine_credential_id is not null and byoa_agent_id is not null)
  )
);

create index if not exists webhook_subscriptions_owner_created_idx
  on public.webhook_subscriptions (lower(owner_wallet), created_at desc);
create index if not exists webhook_subscriptions_machine_created_idx
  on public.webhook_subscriptions (
    byoa_agent_id,
    machine_credential_id,
    created_at desc
  )
  where machine_credential_id is not null;

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique
    default ('evt_' || encode(extensions.gen_random_bytes(12), 'hex'))
    check (public_id ~ '^(evt|evt_test)_[0-9a-f]{24}$'),
  owner_wallet text not null
    check (owner_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  alert_event_id uuid references public.trust_alert_events(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'trust_score_changed',
      'trust_status_changed',
      'risk_added',
      'risk_resolved',
      'verification_failed',
      'recheck_failed',
      'subject_unavailable',
      'test'
    )
  ),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  unique (alert_event_id)
);

create index if not exists webhook_events_owner_created_idx
  on public.webhook_events (lower(owner_wallet), created_at desc);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique
    default ('whd_' || encode(extensions.gen_random_bytes(12), 'hex'))
    check (public_id ~ '^whd_[0-9a-f]{24}$'),
  owner_wallet text not null
    check (owner_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  subscription_id uuid not null
    references public.webhook_subscriptions(id) on delete cascade,
  event_id uuid not null references public.webhook_events(id) on delete cascade,
  status text not null default 'pending' check (
    status in ('pending', 'delivering', 'delivered', 'retry_scheduled', 'failed')
  ),
  attempt_count integer not null default 0 check (attempt_count between 0 and 6),
  next_attempt_at timestamptz not null default now(),
  http_status integer check (http_status is null or http_status between 100 and 599),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 600000),
  error_category text check (
    error_category is null
    or error_category in (
      'timeout',
      'dns_failed',
      'private_network_blocked',
      'tls_failed',
      'connection_failed',
      'redirect_blocked',
      'response_rejected',
      'response_too_large',
      'subscription_paused',
      'secret_unavailable',
      'unknown'
    )
  ),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, event_id)
);

create index if not exists webhook_deliveries_due_idx
  on public.webhook_deliveries (next_attempt_at asc)
  where status in ('pending', 'retry_scheduled');
create index if not exists webhook_deliveries_owner_created_idx
  on public.webhook_deliveries (lower(owner_wallet), created_at desc);
create index if not exists webhook_deliveries_subscription_created_idx
  on public.webhook_deliveries (subscription_id, created_at desc);

drop trigger if exists set_trust_alert_states_updated_at on public.trust_alert_states;
create trigger set_trust_alert_states_updated_at
  before update on public.trust_alert_states
  for each row execute function public.set_trust_monitoring_updated_at();
drop trigger if exists set_webhook_subscriptions_updated_at on public.webhook_subscriptions;
create trigger set_webhook_subscriptions_updated_at
  before update on public.webhook_subscriptions
  for each row execute function public.set_trust_monitoring_updated_at();
drop trigger if exists set_webhook_deliveries_updated_at on public.webhook_deliveries;
create trigger set_webhook_deliveries_updated_at
  before update on public.webhook_deliveries
  for each row execute function public.set_trust_monitoring_updated_at();

create or replace function public.claim_due_webhook_deliveries_v1(p_limit integer)
returns setof public.webhook_deliveries
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select delivery.id
    from public.webhook_deliveries delivery
    join public.webhook_subscriptions subscription
      on subscription.id = delivery.subscription_id
    where delivery.status in ('pending', 'retry_scheduled')
      and delivery.next_attempt_at <= now()
      and delivery.attempt_count < 6
      and subscription.status = 'active'
    order by delivery.next_attempt_at asc
    for update of delivery skip locked
    limit greatest(0, least(coalesce(p_limit, 0), 25))
  )
  update public.webhook_deliveries delivery
  set status = 'delivering',
      attempt_count = delivery.attempt_count + 1,
      updated_at = now()
  from due
  where delivery.id = due.id
  returning delivery.*;
end;
$$;

revoke all on function public.claim_due_webhook_deliveries_v1(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_webhook_deliveries_v1(integer)
  to service_role;

alter table public.trust_alert_events enable row level security;
alter table public.trust_alert_states enable row level security;
alter table public.webhook_subscriptions enable row level security;
alter table public.webhook_events enable row level security;
alter table public.webhook_deliveries enable row level security;

revoke all on table public.trust_alert_events from anon, authenticated;
revoke all on table public.trust_alert_states from anon, authenticated;
revoke all on table public.webhook_subscriptions from anon, authenticated;
revoke all on table public.webhook_events from anon, authenticated;
revoke all on table public.webhook_deliveries from anon, authenticated;
grant all on table public.trust_alert_events to service_role;
grant all on table public.trust_alert_states to service_role;
grant all on table public.webhook_subscriptions to service_role;
grant all on table public.webhook_events to service_role;
grant all on table public.webhook_deliveries to service_role;

drop policy if exists "Allow service access" on public.trust_alert_events;
create policy "Allow service access" on public.trust_alert_events
  for all to service_role using (true) with check (true);
drop policy if exists "Allow service access" on public.trust_alert_states;
create policy "Allow service access" on public.trust_alert_states
  for all to service_role using (true) with check (true);
drop policy if exists "Allow service access" on public.webhook_subscriptions;
create policy "Allow service access" on public.webhook_subscriptions
  for all to service_role using (true) with check (true);
drop policy if exists "Allow service access" on public.webhook_events;
create policy "Allow service access" on public.webhook_events
  for all to service_role using (true) with check (true);
drop policy if exists "Allow service access" on public.webhook_deliveries;
create policy "Allow service access" on public.webhook_deliveries
  for all to service_role using (true) with check (true);

comment on table public.trust_alert_events is
  'Idempotent, public-safe trust change events created only after a canonical snapshot exists.';
comment on table public.trust_alert_states is
  'Owner-scoped unread, read, and archived state for trust alerts.';
comment on table public.webhook_subscriptions is
  'Owner-scoped HTTPS webhook destinations with encrypted HMAC secret material.';
comment on table public.webhook_events is
  'Immutable public-safe webhook payloads reused across every delivery retry.';
comment on table public.webhook_deliveries is
  'Bounded, idempotent webhook delivery attempts with sanitized delivery metadata.';
