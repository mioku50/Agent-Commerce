-- P2.2: seller onboarding, automated service review, availability monitoring,
-- direct-x402 settlement reconciliation, and non-custodial Gateway withdrawals.

alter table public.seller_accounts
  add column if not exists display_name text,
  add column if not exists onboarding_status text not null default 'pending',
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists settlement_mode text not null default 'direct_x402';

update public.seller_accounts
set display_name = coalesce(display_name, 'Arc Seller ' || upper(right(public_id, 6))),
    onboarding_status = 'active',
    terms_accepted_at = coalesce(terms_accepted_at, created_at),
    onboarding_completed_at = coalesce(onboarding_completed_at, created_at),
    settlement_mode = 'direct_x402';

alter table public.seller_accounts
  drop constraint if exists seller_accounts_display_name_check,
  drop constraint if exists seller_accounts_onboarding_status_check,
  drop constraint if exists seller_accounts_settlement_mode_check;
alter table public.seller_accounts
  add constraint seller_accounts_display_name_check
    check (display_name is null or char_length(display_name) between 2 and 80),
  add constraint seller_accounts_onboarding_status_check
    check (onboarding_status in ('pending', 'active', 'suspended')),
  add constraint seller_accounts_settlement_mode_check
    check (settlement_mode = 'direct_x402');

alter table public.store_services
  add column if not exists review_status text not null default 'draft',
  add column if not exists review_submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_reason text,
  add column if not exists availability_status text not null default 'unknown',
  add column if not exists last_health_check_at timestamptz,
  add column if not exists last_healthy_at timestamptz,
  add column if not exists consecutive_health_failures integer not null default 0,
  add column if not exists health_check_input jsonb not null default '{}'::jsonb;

update public.store_services
set review_status = case
      when source_type = 'external_seller' and status in ('active', 'live') then 'approved'
      else 'draft'
    end,
    review_submitted_at = case
      when source_type = 'external_seller' and status in ('active', 'live') then coalesce(review_submitted_at, created_at)
      else review_submitted_at
    end,
    reviewed_at = case
      when source_type = 'external_seller' and status in ('active', 'live') then coalesce(reviewed_at, updated_at)
      else reviewed_at
    end,
    availability_status = case
      when source_type = 'external_seller' and status in ('active', 'live') then 'healthy'
      when source_type = 'external_seller' and status = 'unavailable' then 'unavailable'
      else 'unknown'
    end,
    last_healthy_at = case
      when source_type = 'external_seller' and status in ('active', 'live') then coalesce(last_healthy_at, updated_at)
      else last_healthy_at
    end
where source_type = 'external_seller';

alter table public.store_services
  drop constraint if exists store_services_review_status_check,
  drop constraint if exists store_services_availability_status_check,
  drop constraint if exists store_services_health_failure_count_check,
  drop constraint if exists store_services_health_check_input_check;
alter table public.store_services
  add constraint store_services_review_status_check
    check (review_status in ('draft', 'pending', 'approved', 'changes_requested', 'rejected')),
  add constraint store_services_availability_status_check
    check (availability_status in ('unknown', 'healthy', 'degraded', 'unavailable')),
  add constraint store_services_health_failure_count_check
    check (consecutive_health_failures >= 0),
  add constraint store_services_health_check_input_check
    check (jsonb_typeof(health_check_input) = 'object');

create index if not exists store_services_review_status_idx
  on public.store_services (review_status, created_at desc)
  where source_type = 'external_seller' and archived_at is null;
create index if not exists store_services_health_due_idx
  on public.store_services (last_health_check_at nulls first)
  where source_type = 'external_seller'
    and review_status = 'approved'
    and archived_at is null;

alter table public.seller_service_versions
  add column if not exists health_check_input jsonb not null default '{}'::jsonb;
alter table public.seller_service_versions
  drop constraint if exists seller_service_versions_health_check_input_check;
alter table public.seller_service_versions
  add constraint seller_service_versions_health_check_input_check
    check (jsonb_typeof(health_check_input) = 'object');

create table if not exists public.seller_service_reviews (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_accounts(id) on delete restrict,
  service_id uuid not null references public.store_services(id) on delete restrict,
  service_version integer not null check (service_version > 0),
  status text not null check (status in ('submitted', 'approved', 'changes_requested', 'rejected')),
  reviewer_type text not null default 'automated'
    check (reviewer_type in ('automated', 'operator')),
  checks jsonb not null default '{}'::jsonb check (jsonb_typeof(checks) = 'object'),
  reason text check (reason is null or char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists seller_service_reviews_service_created_idx
  on public.seller_service_reviews (service_id, created_at desc);
create index if not exists seller_service_reviews_seller_created_idx
  on public.seller_service_reviews (seller_id, created_at desc);

create table if not exists public.seller_service_health_checks (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_accounts(id) on delete restrict,
  service_id uuid not null references public.store_services(id) on delete restrict,
  service_version integer not null check (service_version > 0),
  status text not null check (status in ('healthy', 'unhealthy')),
  latency_ms integer check (latency_ms is null or latency_ms between 0 and 60000),
  error_code text check (
    error_code is null or error_code ~ '^[a-z0-9_]{3,80}$'
  ),
  checked_at timestamptz not null default now()
);

create index if not exists seller_service_health_checks_service_checked_idx
  on public.seller_service_health_checks (service_id, checked_at desc);
create index if not exists seller_service_health_checks_seller_checked_idx
  on public.seller_service_health_checks (seller_id, checked_at desc);

create table if not exists public.seller_settlements (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('sst_' || encode(extensions.gen_random_bytes(10), 'hex')),
  seller_id uuid not null references public.seller_accounts(id) on delete restrict,
  ledger_id uuid not null unique references public.seller_revenue_ledger(id) on delete restrict,
  payment_event_id uuid not null references public.payment_events(id) on delete restrict,
  settlement_mode text not null default 'direct_x402' check (settlement_mode = 'direct_x402'),
  amount_usdc numeric(20, 6) not null check (amount_usdc > 0),
  destination_wallet text not null check (destination_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  gateway_transaction text,
  status text not null default 'confirmed' check (status in ('confirmed', 'reversed')),
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists seller_settlements_seller_confirmed_idx
  on public.seller_settlements (seller_id, confirmed_at desc);

alter table public.seller_revenue_ledger
  add column if not exists settlement_mode text not null default 'direct_x402',
  add column if not exists settlement_reference text,
  add column if not exists destination_wallet text;
alter table public.seller_revenue_ledger
  drop constraint if exists seller_revenue_ledger_settlement_mode_check,
  drop constraint if exists seller_revenue_ledger_destination_wallet_check;
alter table public.seller_revenue_ledger
  add constraint seller_revenue_ledger_settlement_mode_check
    check (settlement_mode = 'direct_x402'),
  add constraint seller_revenue_ledger_destination_wallet_check
    check (destination_wallet is null or destination_wallet ~ '^0x[0-9a-fA-F]{40}$');

update public.seller_revenue_ledger ledger
set settlement_status = 'settled',
    settlement_mode = 'direct_x402',
    settlement_reference = payment.gateway_tx,
    destination_wallet = service.seller_wallet,
    settled_at = coalesce(ledger.settled_at, ledger.earned_at, ledger.created_at)
from public.payment_events payment,
     public.store_services service
where payment.id = ledger.payment_event_id
  and service.id = ledger.service_id
  and ledger.settlement_status = 'earned'
  and payment.onchain_status = 'verified'
  and payment.onchain_tx_hash is not null
  and payment.gateway_tx is not null;

insert into public.seller_settlements (
  seller_id, ledger_id, payment_event_id, amount_usdc,
  destination_wallet, gateway_transaction, confirmed_at
)
select
  ledger.seller_id,
  ledger.id,
  ledger.payment_event_id,
  ledger.seller_net_amount_usdc,
  service.seller_wallet,
  payment.gateway_tx,
  coalesce(ledger.settled_at, ledger.earned_at, ledger.created_at)
from public.seller_revenue_ledger ledger
join public.payment_events payment on payment.id = ledger.payment_event_id
join public.store_services service on service.id = ledger.service_id
where ledger.payment_event_id is not null
  and ledger.seller_net_amount_usdc > 0
  and ledger.settlement_status = 'settled'
  and payment.onchain_status = 'verified'
  and payment.onchain_tx_hash is not null
  and payment.gateway_tx is not null
on conflict (ledger_id) do nothing;

create table if not exists public.seller_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('swd_' || encode(extensions.gen_random_bytes(10), 'hex')),
  seller_id uuid not null references public.seller_accounts(id) on delete restrict,
  idempotency_key_hash text not null check (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  amount_usdc numeric(20, 6) not null check (amount_usdc > 0),
  source_chain text not null default 'arcTestnet' check (source_chain = 'arcTestnet'),
  destination_chain text not null default 'arcTestnet' check (destination_chain = 'arcTestnet'),
  destination_wallet text not null check (destination_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  max_fee_usdc numeric(20, 6) not null check (max_fee_usdc > 0),
  burn_intent jsonb not null check (jsonb_typeof(burn_intent) = 'object'),
  owner_signature text,
  gateway_attestation text,
  gateway_signature text,
  mint_calldata text,
  mint_transaction_hash text,
  status text not null default 'awaiting_signature' check (status in (
    'awaiting_signature', 'ready_to_mint', 'submitted', 'confirmed', 'failed', 'expired'
  )),
  failure_code text check (failure_code is null or failure_code ~ '^[a-z0-9_]{3,80}$'),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, idempotency_key_hash),
  check (owner_signature is null or owner_signature ~ '^0x[0-9a-fA-F]+$'),
  check (mint_transaction_hash is null or mint_transaction_hash ~ '^0x[0-9a-fA-F]{64}$')
);

create index if not exists seller_withdrawal_requests_seller_created_idx
  on public.seller_withdrawal_requests (seller_id, created_at desc);

drop trigger if exists set_seller_withdrawal_requests_updated_at
  on public.seller_withdrawal_requests;
create trigger set_seller_withdrawal_requests_updated_at
  before update on public.seller_withdrawal_requests
  for each row execute function public.set_seller_marketplace_updated_at();

create or replace function public.create_seller_service_v2(
  p_seller_id uuid,
  p_name text,
  p_slug text,
  p_short_description text,
  p_long_description text,
  p_category text,
  p_method text,
  p_price_usdc numeric,
  p_input_schema jsonb,
  p_output_schema jsonb,
  p_health_check_input jsonb,
  p_fulfillment_url text,
  p_seller_wallet text,
  p_max_timeout_ms integer,
  p_max_response_size_bytes integer,
  p_endpoint_auth_ciphertext text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_id uuid;
begin
  if not exists (
    select 1 from public.seller_accounts
    where id = p_seller_id
      and status = 'active'
      and onboarding_status = 'active'
      and terms_accepted_at is not null
  ) then
    raise exception 'completed seller onboarding is required';
  end if;

  insert into public.store_services (
    seller_id, name, slug, short_description, long_description, category,
    method, price_usdc, status, source_type, input_schema, output_schema,
    example_request, example_response, example_use_case, agent_reasoning_hint,
    fulfillment_url, seller_wallet, expected_network, expected_asset,
    max_timeout_ms, max_response_size_bytes, wallet_verification_status,
    endpoint_verification_status, service_version, review_status,
    availability_status, health_check_input
  ) values (
    p_seller_id, p_name, p_slug, p_short_description, p_long_description, p_category,
    p_method, p_price_usdc, 'draft', 'external_seller', p_input_schema, p_output_schema,
    p_health_check_input, '{}'::jsonb, p_short_description,
    'Use ' || p_name || ' when its declared input matches the buyer task.',
    p_fulfillment_url, p_seller_wallet, 'eip155:5042002',
    '0x3600000000000000000000000000000000000000', p_max_timeout_ms,
    p_max_response_size_bytes, 'verified', 'unverified', 1, 'draft',
    'unknown', p_health_check_input
  ) returning id into v_service_id;

  insert into public.seller_service_versions (
    service_id, seller_id, service_version, name, short_description,
    long_description, category, method, price_usdc, input_schema, output_schema,
    health_check_input, fulfillment_url, max_timeout_ms, max_response_size_bytes,
    endpoint_auth_scheme, endpoint_auth_ciphertext
  ) values (
    v_service_id, p_seller_id, 1, p_name, p_short_description,
    p_long_description, p_category, p_method, p_price_usdc, p_input_schema,
    p_output_schema, p_health_check_input, p_fulfillment_url, p_max_timeout_ms,
    p_max_response_size_bytes,
    case when p_endpoint_auth_ciphertext is null then 'none' else 'bearer' end,
    p_endpoint_auth_ciphertext
  );

  return v_service_id;
end;
$$;

create or replace function public.update_seller_service_v2(
  p_service_id uuid,
  p_seller_id uuid,
  p_expected_version integer,
  p_create_version boolean,
  p_name text,
  p_short_description text,
  p_long_description text,
  p_category text,
  p_method text,
  p_price_usdc numeric,
  p_status text,
  p_input_schema jsonb,
  p_output_schema jsonb,
  p_health_check_input jsonb,
  p_fulfillment_url text,
  p_max_timeout_ms integer,
  p_max_response_size_bytes integer,
  p_endpoint_auth_ciphertext text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.store_services%rowtype;
  v_next_version integer;
  v_next_status text;
begin
  select * into v_service
  from public.store_services
  where id = p_service_id
    and seller_id = p_seller_id
    and source_type = 'external_seller'
    and archived_at is null
  for update;

  if v_service.id is null then return false; end if;
  if not exists (
    select 1 from public.seller_accounts
    where id = p_seller_id and status = 'active' and onboarding_status = 'active'
  ) then
    raise exception 'active onboarded seller account is required';
  end if;
  if v_service.service_version <> p_expected_version then
    raise exception 'seller service version changed concurrently';
  end if;

  v_next_version := case when p_create_version then p_expected_version + 1 else p_expected_version end;
  if p_create_version then
    insert into public.seller_service_versions (
      service_id, seller_id, service_version, name, short_description,
      long_description, category, method, price_usdc, input_schema, output_schema,
      health_check_input, fulfillment_url, max_timeout_ms, max_response_size_bytes,
      endpoint_auth_scheme, endpoint_auth_ciphertext
    ) values (
      p_service_id, p_seller_id, v_next_version, p_name, p_short_description,
      p_long_description, p_category, p_method, p_price_usdc, p_input_schema,
      p_output_schema, p_health_check_input, p_fulfillment_url, p_max_timeout_ms,
      p_max_response_size_bytes,
      case when p_endpoint_auth_ciphertext is null then 'none' else 'bearer' end,
      p_endpoint_auth_ciphertext
    );
    v_next_status := 'draft';
  elsif p_status = 'active' then
    if v_service.review_status <> 'approved'
      or v_service.availability_status not in ('healthy', 'degraded') then
      raise exception 'approved and available service is required for activation';
    end if;
    v_next_status := 'active';
  elsif p_status in ('draft', 'paused', 'archived') then
    v_next_status := p_status;
  else
    raise exception 'seller cannot set this service status directly';
  end if;

  update public.store_services
  set name = p_name,
      short_description = p_short_description,
      long_description = p_long_description,
      category = p_category,
      method = p_method,
      price_usdc = p_price_usdc,
      status = v_next_status,
      input_schema = p_input_schema,
      output_schema = p_output_schema,
      example_request = p_health_check_input,
      fulfillment_url = p_fulfillment_url,
      max_timeout_ms = p_max_timeout_ms,
      max_response_size_bytes = p_max_response_size_bytes,
      health_check_input = p_health_check_input,
      service_version = v_next_version,
      review_status = case when p_create_version then 'draft' else review_status end,
      review_submitted_at = case when p_create_version then null else review_submitted_at end,
      reviewed_at = case when p_create_version then null else reviewed_at end,
      review_reason = case when p_create_version then null else review_reason end,
      availability_status = case when p_create_version then 'unknown' else availability_status end,
      consecutive_health_failures = case when p_create_version then 0 else consecutive_health_failures end,
      last_health_check_at = case when p_create_version then null else last_health_check_at end,
      last_healthy_at = case when p_create_version then null else last_healthy_at end,
      archived_at = case when v_next_status = 'archived' then now() else null end
  where id = p_service_id and seller_id = p_seller_id;

  return true;
end;
$$;

create or replace function public.finalize_seller_service_review_v1(
  p_seller_id uuid,
  p_service_id uuid,
  p_service_version integer,
  p_approved boolean,
  p_checks jsonb,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.store_services%rowtype;
begin
  select * into v_service from public.store_services
  where id = p_service_id
    and seller_id = p_seller_id
    and source_type = 'external_seller'
    and archived_at is null
  for update;
  if v_service.id is null or v_service.service_version <> p_service_version then
    return false;
  end if;

  insert into public.seller_service_reviews (
    seller_id, service_id, service_version, status, checks, reason
  ) values (
    p_seller_id, p_service_id, p_service_version,
    case when p_approved then 'approved' else 'changes_requested' end,
    coalesce(p_checks, '{}'::jsonb), nullif(left(coalesce(p_reason, ''), 500), '')
  );

  update public.store_services
  set review_status = case when p_approved then 'approved' else 'changes_requested' end,
      review_submitted_at = coalesce(review_submitted_at, now()),
      reviewed_at = now(),
      review_reason = nullif(left(coalesce(p_reason, ''), 500), ''),
      status = case when p_approved then 'active' else 'draft' end,
      availability_status = case when p_approved then 'healthy' else 'unknown' end,
      consecutive_health_failures = 0,
      last_health_check_at = now(),
      last_healthy_at = case when p_approved then now() else last_healthy_at end,
      endpoint_verification_status = case when p_approved then 'verified' else 'failed' end
  where id = p_service_id and seller_id = p_seller_id;
  return true;
end;
$$;

create or replace function public.record_seller_health_check_v1(
  p_seller_id uuid,
  p_service_id uuid,
  p_service_version integer,
  p_healthy boolean,
  p_latency_ms integer,
  p_error_code text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.store_services%rowtype;
  v_failures integer;
  v_availability text;
begin
  select * into v_service from public.store_services
  where id = p_service_id
    and seller_id = p_seller_id
    and source_type = 'external_seller'
    and archived_at is null
  for update;
  if v_service.id is null or v_service.service_version <> p_service_version then
    raise exception 'seller service version changed during health check';
  end if;

  insert into public.seller_service_health_checks (
    seller_id, service_id, service_version, status, latency_ms, error_code
  ) values (
    p_seller_id, p_service_id, p_service_version,
    case when p_healthy then 'healthy' else 'unhealthy' end,
    least(greatest(coalesce(p_latency_ms, 0), 0), 60000),
    case when p_healthy then null else p_error_code end
  );

  if p_healthy then
    v_failures := 0;
    v_availability := 'healthy';
    update public.store_services
    set availability_status = v_availability,
        consecutive_health_failures = 0,
        last_health_check_at = now(),
        last_healthy_at = now(),
        status = case
          when review_status = 'approved' and status = 'unavailable' then 'active'
          else status
        end
    where id = p_service_id;
  else
    v_failures := v_service.consecutive_health_failures + 1;
    v_availability := case when v_failures >= 3 then 'unavailable' else 'degraded' end;
    update public.store_services
    set availability_status = v_availability,
        consecutive_health_failures = v_failures,
        last_health_check_at = now(),
        status = case when v_failures >= 3 and status = 'active' then 'unavailable' else status end
    where id = p_service_id;
  end if;
  return v_availability;
end;
$$;

create or replace function public.finalize_seller_workflow_success_v1(
  p_job_id uuid,
  p_service_id uuid,
  p_service_version integer,
  p_receipt_id uuid,
  p_payment_event_id uuid,
  p_provider_cost_usdc numeric
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.hosted_agent_jobs%rowtype;
  v_quote public.hosted_workflow_quotes%rowtype;
  v_payment public.hosted_workflow_user_payments%rowtype;
  v_event public.payment_events%rowtype;
  v_service public.store_services%rowtype;
  v_ledger_id uuid;
begin
  select * into v_job from public.hosted_agent_jobs where id = p_job_id for update;
  if v_job.id is null or v_job.status <> 'completed' or v_job.structured_result is null then
    raise exception 'seller workflow job is not complete';
  end if;
  select * into v_quote from public.hosted_workflow_quotes
  where id = v_job.workflow_quote_id for update;
  if v_quote.id is null
    or v_quote.seller_service_id is distinct from p_service_id
    or v_quote.seller_service_version is distinct from p_service_version
    or v_quote.seller_id is null
    or v_quote.seller_net_amount_usdc is null then
    raise exception 'seller quote snapshot mismatch';
  end if;
  select * into v_payment from public.hosted_workflow_user_payments
  where job_id = p_job_id for update;
  if v_payment.id is null then raise exception 'seller buyer payment is missing'; end if;
  select * into v_event from public.payment_events where id = p_payment_event_id;
  select * into v_service from public.store_services where id = p_service_id;
  if p_receipt_id is null or v_event.id is null or v_service.id is null
    or not exists (
      select 1 from public.agent_purchase_steps receipt
      where receipt.id = p_receipt_id
        and receipt.run_id = v_job.agent_run_id
        and receipt.payment_event_id = p_payment_event_id
        and receipt.status = 'paid'
    )
    or v_event.onchain_status <> 'verified'
    or v_event.onchain_tx_hash is null
    or v_event.gateway_tx is null then
    raise exception 'validated seller receipt, settlement, or Arc proof is missing';
  end if;
  if not public.finalize_hosted_workflow_user_payment_v1(
    p_job_id, greatest(0, p_provider_cost_usdc), true, null
  ) then
    raise exception 'seller buyer accounting finalization failed';
  end if;

  insert into public.seller_revenue_ledger (
    seller_id, service_id, service_version, quote_id, job_id, user_payment_id,
    receipt_id, payment_event_id, buyer_payment_usdc, gross_amount_usdc,
    platform_fee_usdc, seller_net_amount_usdc, settlement_status,
    settlement_mode, settlement_reference, destination_wallet, earned_at, settled_at
  ) values (
    v_quote.seller_id, p_service_id, p_service_version, v_quote.id, p_job_id,
    v_payment.id, p_receipt_id, p_payment_event_id, v_payment.gross_amount_usdc,
    v_quote.list_price_usdc, v_quote.platform_fee_usdc,
    v_quote.seller_net_amount_usdc, 'settled', 'direct_x402', v_event.gateway_tx,
    v_service.seller_wallet, now(), now()
  ) on conflict (job_id) do update
    set settlement_status = 'settled',
        settlement_mode = 'direct_x402',
        settlement_reference = excluded.settlement_reference,
        destination_wallet = excluded.destination_wallet,
        settled_at = coalesce(seller_revenue_ledger.settled_at, now())
  returning id into v_ledger_id;

  insert into public.seller_settlements (
    seller_id, ledger_id, payment_event_id, amount_usdc,
    destination_wallet, gateway_transaction, status, confirmed_at
  ) values (
    v_quote.seller_id, v_ledger_id, p_payment_event_id,
    v_quote.seller_net_amount_usdc, v_service.seller_wallet,
    v_event.gateway_tx, 'confirmed', now()
  ) on conflict (ledger_id) do nothing;
  return true;
end;
$$;

revoke all on function public.create_seller_service_v2(uuid, text, text, text, text, text, text, numeric, jsonb, jsonb, jsonb, text, text, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.create_seller_service_v2(uuid, text, text, text, text, text, text, numeric, jsonb, jsonb, jsonb, text, text, integer, integer, text)
  to service_role;
revoke all on function public.update_seller_service_v2(uuid, uuid, integer, boolean, text, text, text, text, text, numeric, text, jsonb, jsonb, jsonb, text, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.update_seller_service_v2(uuid, uuid, integer, boolean, text, text, text, text, text, numeric, text, jsonb, jsonb, jsonb, text, integer, integer, text)
  to service_role;
revoke all on function public.finalize_seller_service_review_v1(uuid, uuid, integer, boolean, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.finalize_seller_service_review_v1(uuid, uuid, integer, boolean, jsonb, text)
  to service_role;
revoke all on function public.record_seller_health_check_v1(uuid, uuid, integer, boolean, integer, text)
  from public, anon, authenticated;
grant execute on function public.record_seller_health_check_v1(uuid, uuid, integer, boolean, integer, text)
  to service_role;

alter table public.seller_service_reviews enable row level security;
alter table public.seller_service_health_checks enable row level security;
alter table public.seller_settlements enable row level security;
alter table public.seller_withdrawal_requests enable row level security;

revoke all on table public.seller_service_reviews from anon, authenticated;
revoke all on table public.seller_service_health_checks from anon, authenticated;
revoke all on table public.seller_settlements from anon, authenticated;
revoke all on table public.seller_withdrawal_requests from anon, authenticated;
grant all on table public.seller_service_reviews to service_role;
grant all on table public.seller_service_health_checks to service_role;
grant all on table public.seller_settlements to service_role;
grant all on table public.seller_withdrawal_requests to service_role;

drop policy if exists "Allow service access" on public.seller_service_reviews;
create policy "Allow service access" on public.seller_service_reviews
  for all to service_role using (true) with check (true);
drop policy if exists "Allow service access" on public.seller_service_health_checks;
create policy "Allow service access" on public.seller_service_health_checks
  for all to service_role using (true) with check (true);
drop policy if exists "Allow service access" on public.seller_settlements;
create policy "Allow service access" on public.seller_settlements
  for all to service_role using (true) with check (true);
drop policy if exists "Allow service access" on public.seller_withdrawal_requests;
create policy "Allow service access" on public.seller_withdrawal_requests
  for all to service_role using (true) with check (true);

drop policy if exists "Allow public read access" on public.withdrawals;
revoke select, insert, update, delete on table public.withdrawals from anon, authenticated;

drop policy if exists "Allow public read of published services" on public.store_services;
create policy "Allow public read of published services"
  on public.store_services for select
  using (
    status in ('active', 'live', 'coming-soon')
    and archived_at is null
    and (
      source_type <> 'external_seller'
      or (review_status = 'approved' and availability_status in ('healthy', 'degraded'))
    )
  );

comment on table public.seller_service_reviews is
  'Append-only automated/operator review decisions for immutable seller service versions.';
comment on table public.seller_service_health_checks is
  'Secret-free availability probe outcomes; raw provider errors and payloads are never stored.';
comment on table public.seller_settlements is
  'Confirmed direct x402 settlements already paid to the registered seller wallet.';
comment on table public.seller_withdrawal_requests is
  'Seller-scoped non-custodial Gateway withdrawal intents signed by the verified owner wallet.';
