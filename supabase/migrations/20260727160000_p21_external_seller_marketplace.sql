-- P2.1: external seller marketplace, immutable service versions, and revenue ledger.

create table if not exists public.seller_accounts (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('sel_' || encode(extensions.gen_random_bytes(10), 'hex')),
  owner_wallet text not null check (owner_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists seller_accounts_owner_wallet_idx
  on public.seller_accounts (lower(owner_wallet));

alter table public.store_services
  add column if not exists public_id text,
  add column if not exists seller_id uuid references public.seller_accounts(id) on delete restrict,
  add column if not exists service_version integer not null default 1,
  add column if not exists archived_at timestamptz;

update public.store_services
set public_id = 'svc_' || encode(extensions.gen_random_bytes(10), 'hex')
where public_id is null;

alter table public.store_services
  alter column public_id set default ('svc_' || encode(extensions.gen_random_bytes(10), 'hex')),
  alter column public_id set not null;

create unique index if not exists store_services_public_id_idx
  on public.store_services (public_id);

create index if not exists store_services_seller_created_idx
  on public.store_services (seller_id, created_at desc)
  where seller_id is not null;

alter table public.store_services
  drop constraint if exists store_services_status_check;

alter table public.store_services
  add constraint store_services_status_check
  check (status in (
    'draft', 'active', 'paused', 'unavailable', 'archived',
    'verifying', 'live', 'disabled', 'coming-soon'
  ));

create table if not exists public.seller_service_versions (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.store_services(id) on delete restrict,
  seller_id uuid not null references public.seller_accounts(id) on delete restrict,
  service_version integer not null check (service_version > 0),
  name text not null,
  short_description text not null,
  long_description text not null,
  category text not null,
  method text not null check (method in ('GET', 'POST')),
  price_usdc numeric(20, 6) not null check (price_usdc > 0),
  input_schema jsonb not null check (jsonb_typeof(input_schema) = 'object'),
  output_schema jsonb not null check (jsonb_typeof(output_schema) = 'object'),
  fulfillment_url text not null check (fulfillment_url ~ '^https://'),
  max_timeout_ms integer not null check (max_timeout_ms between 1000 and 30000),
  max_response_size_bytes integer not null check (max_response_size_bytes between 1024 and 1048576),
  expected_network text not null default 'eip155:5042002'
    check (expected_network = 'eip155:5042002'),
  expected_asset text not null default '0x3600000000000000000000000000000000000000'
    check (lower(expected_asset) = '0x3600000000000000000000000000000000000000'),
  endpoint_auth_scheme text not null default 'none'
    check (endpoint_auth_scheme in ('none', 'bearer')),
  endpoint_auth_ciphertext text,
  created_at timestamptz not null default now(),
  unique (service_id, service_version),
  check (
    (endpoint_auth_scheme = 'none' and endpoint_auth_ciphertext is null)
    or
    (endpoint_auth_scheme = 'bearer' and endpoint_auth_ciphertext is not null)
  )
);

create index if not exists seller_service_versions_seller_idx
  on public.seller_service_versions (seller_id, created_at desc);

create or replace function public.prevent_seller_service_version_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'seller service versions are immutable';
end;
$$;

drop trigger if exists prevent_seller_service_version_update
  on public.seller_service_versions;
create trigger prevent_seller_service_version_update
  before update or delete on public.seller_service_versions
  for each row execute function public.prevent_seller_service_version_mutation();

create or replace function public.create_seller_service_v1(
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
    where id = p_seller_id and status = 'active'
  ) then
    raise exception 'active seller account is required';
  end if;

  insert into public.store_services (
    seller_id, name, slug, short_description, long_description, category,
    method, price_usdc, status, source_type, input_schema, output_schema,
    example_request, example_response, example_use_case, agent_reasoning_hint,
    fulfillment_url, seller_wallet, expected_network, expected_asset,
    max_timeout_ms, max_response_size_bytes, wallet_verification_status,
    endpoint_verification_status, service_version
  ) values (
    p_seller_id, p_name, p_slug, p_short_description, p_long_description, p_category,
    p_method, p_price_usdc, 'draft', 'external_seller', p_input_schema, p_output_schema,
    '{}'::jsonb, '{}'::jsonb, p_short_description,
    'Use ' || p_name || ' when its declared input matches the buyer task.',
    p_fulfillment_url, p_seller_wallet, 'eip155:5042002',
    '0x3600000000000000000000000000000000000000', p_max_timeout_ms,
    p_max_response_size_bytes, 'verified', 'verified', 1
  ) returning id into v_service_id;

  insert into public.seller_service_versions (
    service_id, seller_id, service_version, name, short_description,
    long_description, category, method, price_usdc, input_schema, output_schema,
    fulfillment_url, max_timeout_ms, max_response_size_bytes,
    endpoint_auth_scheme, endpoint_auth_ciphertext
  ) values (
    v_service_id, p_seller_id, 1, p_name, p_short_description,
    p_long_description, p_category, p_method, p_price_usdc, p_input_schema,
    p_output_schema, p_fulfillment_url, p_max_timeout_ms,
    p_max_response_size_bytes,
    case when p_endpoint_auth_ciphertext is null then 'none' else 'bearer' end,
    p_endpoint_auth_ciphertext
  );

  return v_service_id;
end;
$$;

create or replace function public.update_seller_service_v1(
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
begin
  select * into v_service
  from public.store_services
  where id = p_service_id
    and seller_id = p_seller_id
    and source_type = 'external_seller'
    and archived_at is null
  for update;

  if v_service.id is null then
    return false;
  end if;
  if not exists (
    select 1 from public.seller_accounts
    where id = p_seller_id and status = 'active'
  ) then
    raise exception 'active seller account is required';
  end if;
  if v_service.service_version <> p_expected_version then
    raise exception 'seller service version changed concurrently';
  end if;

  v_next_version := case when p_create_version then p_expected_version + 1 else p_expected_version end;
  if p_create_version then
    insert into public.seller_service_versions (
      service_id, seller_id, service_version, name, short_description,
      long_description, category, method, price_usdc, input_schema, output_schema,
      fulfillment_url, max_timeout_ms, max_response_size_bytes,
      endpoint_auth_scheme, endpoint_auth_ciphertext
    ) values (
      p_service_id, p_seller_id, v_next_version, p_name, p_short_description,
      p_long_description, p_category, p_method, p_price_usdc, p_input_schema,
      p_output_schema, p_fulfillment_url, p_max_timeout_ms,
      p_max_response_size_bytes,
      case when p_endpoint_auth_ciphertext is null then 'none' else 'bearer' end,
      p_endpoint_auth_ciphertext
    );
  end if;

  update public.store_services
  set name = p_name,
      short_description = p_short_description,
      long_description = p_long_description,
      category = p_category,
      method = p_method,
      price_usdc = p_price_usdc,
      status = p_status,
      input_schema = p_input_schema,
      output_schema = p_output_schema,
      fulfillment_url = p_fulfillment_url,
      max_timeout_ms = p_max_timeout_ms,
      max_response_size_bytes = p_max_response_size_bytes,
      service_version = v_next_version,
      archived_at = case when p_status = 'archived' then now() else null end
  where id = p_service_id and seller_id = p_seller_id;

  return true;
end;
$$;

revoke all on function public.create_seller_service_v1(uuid, text, text, text, text, text, text, numeric, jsonb, jsonb, text, text, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.create_seller_service_v1(uuid, text, text, text, text, text, text, numeric, jsonb, jsonb, text, text, integer, integer, text)
  to service_role;
revoke all on function public.update_seller_service_v1(uuid, uuid, integer, boolean, text, text, text, text, text, numeric, text, jsonb, jsonb, text, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.update_seller_service_v1(uuid, uuid, integer, boolean, text, text, text, text, text, numeric, text, jsonb, jsonb, text, integer, integer, text)
  to service_role;

alter table public.hosted_workflow_quotes
  add column if not exists seller_service_id uuid
    references public.store_services(id) on delete restrict,
  add column if not exists seller_service_version integer,
  add column if not exists seller_id uuid
    references public.seller_accounts(id) on delete restrict,
  add column if not exists seller_net_amount_usdc numeric(20, 6);

alter table public.hosted_workflow_quotes
  drop constraint if exists hosted_workflow_quotes_seller_snapshot_check;
alter table public.hosted_workflow_quotes
  add constraint hosted_workflow_quotes_seller_snapshot_check
  check (
    (seller_service_id is null and seller_service_version is null and seller_id is null and seller_net_amount_usdc is null)
    or
    (seller_service_id is not null and seller_service_version > 0 and seller_id is not null and seller_net_amount_usdc >= 0)
  );

create index if not exists hosted_workflow_quotes_seller_snapshot_idx
  on public.hosted_workflow_quotes (seller_service_id, seller_service_version, created_at desc)
  where seller_service_id is not null;

alter table public.hosted_workflow_quotes
  drop constraint if exists hosted_workflow_quotes_workflow_type_check;
alter table public.hosted_workflow_quotes
  add constraint hosted_workflow_quotes_workflow_type_check
  check (
    workflow_type in (
      'github_due_diligence', 'sentiment_tone', 'builder_update',
      'market_context', 'custom_task'
    )
    or workflow_type ~ '^seller_[a-z0-9_]{3,80}$'
  ) not valid;
alter table public.hosted_workflow_quotes
  validate constraint hosted_workflow_quotes_workflow_type_check;

alter table public.hosted_agent_jobs
  drop constraint if exists hosted_agent_jobs_workflow_type_check;
alter table public.hosted_agent_jobs
  add constraint hosted_agent_jobs_workflow_type_check
  check (
    workflow_type in (
      'github_due_diligence', 'sentiment_tone', 'builder_update',
      'market_context', 'custom_task'
    )
    or workflow_type ~ '^seller_[a-z0-9_]{3,80}$'
  ) not valid;
alter table public.hosted_agent_jobs
  validate constraint hosted_agent_jobs_workflow_type_check;

alter table public.byoa_agent_policies
  drop constraint if exists byoa_agent_policies_allowed_workflows_check;
alter table public.byoa_agent_policies
  add constraint byoa_agent_policies_allowed_workflows_check
  check (
    cardinality(allowed_workflows) between 1 and 12
    and array_to_string(allowed_workflows, ',') ~
      '^((\*|github_due_diligence|sentiment_tone|builder_update|market_context|custom_task|seller:\*|seller_[a-z0-9_]{3,80})(,(\*|github_due_diligence|sentiment_tone|builder_update|market_context|custom_task|seller:\*|seller_[a-z0-9_]{3,80}))*)$'
  ) not valid;
alter table public.byoa_agent_policies
  validate constraint byoa_agent_policies_allowed_workflows_check;

create table if not exists public.seller_revenue_ledger (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_accounts(id) on delete restrict,
  service_id uuid not null references public.store_services(id) on delete restrict,
  service_version integer not null check (service_version > 0),
  quote_id uuid not null unique references public.hosted_workflow_quotes(id) on delete restrict,
  job_id uuid not null unique references public.hosted_agent_jobs(id) on delete restrict,
  user_payment_id uuid references public.hosted_workflow_user_payments(id) on delete restrict,
  receipt_id uuid references public.agent_purchase_steps(id) on delete set null,
  payment_event_id uuid references public.payment_events(id) on delete set null,
  buyer_payment_usdc numeric(20, 6) not null check (buyer_payment_usdc >= 0),
  gross_amount_usdc numeric(20, 6) not null check (gross_amount_usdc >= 0),
  platform_fee_usdc numeric(20, 6) not null check (platform_fee_usdc >= 0),
  seller_net_amount_usdc numeric(20, 6) not null check (seller_net_amount_usdc >= 0),
  settlement_status text not null check (settlement_status in (
    'pending', 'earned', 'settlement_pending', 'settled', 'failed', 'reversed'
  )),
  transaction_hash text check (
    transaction_hash is null or transaction_hash ~ '^0x[0-9a-fA-F]{64}$'
  ),
  failure_reason text,
  earned_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seller_revenue_ledger_seller_created_idx
  on public.seller_revenue_ledger (seller_id, created_at desc);

create or replace function public.set_seller_marketplace_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_seller_accounts_updated_at on public.seller_accounts;
create trigger set_seller_accounts_updated_at
  before update on public.seller_accounts
  for each row execute function public.set_seller_marketplace_updated_at();

drop trigger if exists set_seller_revenue_ledger_updated_at on public.seller_revenue_ledger;
create trigger set_seller_revenue_ledger_updated_at
  before update on public.seller_revenue_ledger
  for each row execute function public.set_seller_marketplace_updated_at();

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
begin
  select * into v_job
  from public.hosted_agent_jobs
  where id = p_job_id
  for update;

  if v_job.id is null or v_job.status <> 'completed' or v_job.structured_result is null then
    raise exception 'seller workflow job is not complete';
  end if;

  select * into v_quote
  from public.hosted_workflow_quotes
  where id = v_job.workflow_quote_id
  for update;

  if v_quote.id is null
    or v_quote.seller_service_id is distinct from p_service_id
    or v_quote.seller_service_version is distinct from p_service_version
    or v_quote.seller_id is null
    or v_quote.seller_net_amount_usdc is null then
    raise exception 'seller quote snapshot mismatch';
  end if;

  select * into v_payment
  from public.hosted_workflow_user_payments
  where job_id = p_job_id
  for update;

  if v_payment.id is null then
    raise exception 'seller buyer payment is missing';
  end if;

  if p_receipt_id is null
    or p_payment_event_id is null
    or not exists (
      select 1
      from public.agent_purchase_steps receipt
      join public.payment_events payment_event
        on payment_event.id = receipt.payment_event_id
      where receipt.id = p_receipt_id
        and receipt.run_id = v_job.agent_run_id
        and receipt.payment_event_id = p_payment_event_id
        and receipt.status = 'paid'
        and payment_event.onchain_status = 'verified'
        and payment_event.onchain_tx_hash is not null
    ) then
    raise exception 'validated seller receipt or Arc proof is missing';
  end if;

  if not public.finalize_hosted_workflow_user_payment_v1(
    p_job_id,
    greatest(0, p_provider_cost_usdc),
    true,
    null
  ) then
    raise exception 'seller buyer accounting finalization failed';
  end if;

  insert into public.seller_revenue_ledger (
    seller_id,
    service_id,
    service_version,
    quote_id,
    job_id,
    user_payment_id,
    receipt_id,
    payment_event_id,
    buyer_payment_usdc,
    gross_amount_usdc,
    platform_fee_usdc,
    seller_net_amount_usdc,
    settlement_status,
    transaction_hash,
    earned_at
  ) values (
    v_quote.seller_id,
    p_service_id,
    p_service_version,
    v_quote.id,
    p_job_id,
    v_payment.id,
    p_receipt_id,
    p_payment_event_id,
    v_payment.gross_amount_usdc,
    v_quote.list_price_usdc,
    v_quote.platform_fee_usdc,
    v_quote.seller_net_amount_usdc,
    'earned',
    v_payment.transaction_hash,
    now()
  )
  on conflict (job_id) do nothing;

  return true;
end;
$$;

revoke all on function public.finalize_seller_workflow_success_v1(uuid, uuid, integer, uuid, uuid, numeric)
  from public, anon, authenticated;
grant execute on function public.finalize_seller_workflow_success_v1(uuid, uuid, integer, uuid, uuid, numeric)
  to service_role;

alter table public.seller_accounts enable row level security;
alter table public.seller_service_versions enable row level security;
alter table public.seller_revenue_ledger enable row level security;

revoke all on table public.seller_accounts from anon, authenticated;
revoke all on table public.seller_service_versions from anon, authenticated;
revoke all on table public.seller_revenue_ledger from anon, authenticated;

drop policy if exists "Allow service access" on public.seller_accounts;
create policy "Allow service access" on public.seller_accounts
  for all to service_role using (true) with check (true);
drop policy if exists "Allow service access" on public.seller_service_versions;
create policy "Allow service access" on public.seller_service_versions
  for all to service_role using (true) with check (true);
drop policy if exists "Allow service access" on public.seller_revenue_ledger;
create policy "Allow service access" on public.seller_revenue_ledger
  for all to service_role using (true) with check (true);

drop policy if exists "Allow public read of published services" on public.store_services;
create policy "Allow public read of published services"
  on public.store_services for select
  using (status in ('active', 'live', 'coming-soon') and archived_at is null);

revoke select on table public.store_services from anon, authenticated;
grant select (
  public_id, created_at, updated_at, name, short_description,
  long_description, category, method, price_usdc, status, source_type,
  input_schema, output_schema, example_request, example_response,
  example_use_case, agent_reasoning_hint, service_version
) on table public.store_services to anon, authenticated;

comment on table public.seller_service_versions is
  'Immutable server-only external seller routing and schema snapshots.';
comment on column public.seller_service_versions.endpoint_auth_ciphertext is
  'Application-encrypted endpoint authorization secret; never expose to clients.';
comment on table public.seller_revenue_ledger is
  'Seller-scoped immutable commerce earnings linked to successful workflow jobs.';
