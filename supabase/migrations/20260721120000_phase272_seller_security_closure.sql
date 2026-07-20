-- Phase 27.2: external seller security closure.

-- Self-contained repair for installations where the two historical
-- 20260720120000 migrations collided in the migration ledger.
alter table public.store_services
  add column if not exists fulfillment_url text not null default '',
  add column if not exists seller_wallet text not null default '',
  add column if not exists expected_network text not null default 'eip155:5042002',
  add column if not exists expected_asset text not null default '0x3600000000000000000000000000000000000000',
  add column if not exists max_timeout_ms integer not null default 15000,
  add column if not exists max_response_size_bytes integer not null default 1048576,
  add column if not exists wallet_verification_status text not null default 'unverified',
  add column if not exists endpoint_verification_status text not null default 'unverified',
  add column if not exists wallet_verification_challenge text not null default '',
  add column if not exists endpoint_verification_nonce text not null default '';

alter table public.store_services
  drop constraint if exists store_services_status_check;
alter table public.store_services
  add constraint store_services_status_check
  check (status in ('draft', 'verifying', 'live', 'disabled', 'coming-soon'));

alter table public.store_services
  drop constraint if exists store_services_source_type_check;
alter table public.store_services
  add constraint store_services_source_type_check
  check (source_type in ('seller_mock', 'external_placeholder', 'external_seller'));

alter table public.store_services
  drop constraint if exists store_services_wallet_verification_status_check;

alter table public.store_services
  add constraint store_services_wallet_verification_status_check
  check (wallet_verification_status in ('unverified', 'verified', 'failed'));

alter table public.store_services
  drop constraint if exists store_services_endpoint_verification_status_check;

alter table public.store_services
  add constraint store_services_endpoint_verification_status_check
  check (endpoint_verification_status in ('unverified', 'verified', 'failed'));

alter table public.store_services
  add column if not exists endpoint_verification_expires_at timestamptz;

drop policy if exists "Allow public read of published services" on public.store_services;
create policy "Allow public read of published services"
  on public.store_services for select
  using (status in ('live', 'coming-soon'));

revoke select on table public.store_services from anon, authenticated;
grant select (
  id, created_at, updated_at, name, slug, short_description, long_description,
  category, method, price_usdc, status, source_type, input_schema, output_schema,
  example_request, example_response, example_use_case, agent_reasoning_hint
) on table public.store_services to anon, authenticated;

create table if not exists public.seller_auth_attempts (
  identifier text primary key,
  failure_count integer not null default 0 check (failure_count >= 0),
  locked_until timestamptz,
  last_attempt_at timestamptz not null default now()
);

alter table public.seller_auth_attempts enable row level security;
revoke all on table public.seller_auth_attempts from anon, authenticated;

create or replace function public.consume_seller_auth_attempt(
  p_identifier text,
  p_password_valid boolean,
  p_max_failures integer default 5,
  p_lockout_seconds integer default 900
)
returns table (allowed boolean, locked boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.seller_auth_attempts%rowtype;
  v_now timestamptz := clock_timestamp();
  v_failures integer;
begin
  if p_identifier is null or length(p_identifier) <> 64
     or p_max_failures < 1 or p_lockout_seconds < 1 then
    raise exception 'invalid seller auth attempt parameters';
  end if;

  select * into v_row
  from public.seller_auth_attempts
  where identifier = p_identifier
  for update;

  if found and v_row.locked_until is not null and v_row.locked_until > v_now then
    return query select false, true,
      greatest(1, ceil(extract(epoch from (v_row.locked_until - v_now)))::integer);
    return;
  end if;

  if p_password_valid then
    delete from public.seller_auth_attempts where identifier = p_identifier;
    return query select true, false, 0;
    return;
  end if;

  v_failures := coalesce(v_row.failure_count, 0) + 1;
  insert into public.seller_auth_attempts(identifier, failure_count, locked_until, last_attempt_at)
  values (
    p_identifier,
    v_failures,
    case when v_failures >= p_max_failures
      then v_now + make_interval(secs => p_lockout_seconds)
      else null end,
    v_now
  )
  on conflict (identifier) do update set
    failure_count = excluded.failure_count,
    locked_until = excluded.locked_until,
    last_attempt_at = excluded.last_attempt_at;

  return query select false, v_failures >= p_max_failures,
    case when v_failures >= p_max_failures then p_lockout_seconds else 0 end;
end;
$$;

revoke all on function public.consume_seller_auth_attempt(text, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_seller_auth_attempt(text, boolean, integer, integer) to service_role;

create table if not exists public.external_fulfillment_credits (
  id uuid primary key default gen_random_uuid(),
  payment_fingerprint text not null unique check (length(payment_fingerprint) = 64),
  service_id text not null,
  endpoint text not null,
  payer text not null,
  amount_usdc numeric(20, 6) not null check (amount_usdc > 0),
  reason text not null,
  status text not null default 'issued' check (status in ('issued', 'redeemed', 'refund_pending', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.external_fulfillment_credits enable row level security;
revoke all on table public.external_fulfillment_credits from anon, authenticated;
