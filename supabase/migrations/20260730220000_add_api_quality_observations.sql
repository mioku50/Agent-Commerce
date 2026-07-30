-- Migration: Add API Quality Observations table for Veyra Paid API Quality Reports
-- Timestamp: 20260730220000

create table if not exists public.api_quality_observations (
  observation_id uuid primary key default gen_random_uuid(),
  service_id text not null,
  seller_public_id text,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  quoted_price_usdc numeric(20, 6) not null default 0 check (quoted_price_usdc >= 0),
  paid_amount_usdc numeric(20, 6) not null default 0 check (paid_amount_usdc >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  http_status_class text not null check (http_status_class in ('2xx', '4xx', '5xx', 'timeout', 'network_error')),
  endpoint_reached boolean not null default false,
  response_schema_valid boolean not null default false,
  response_within_size_limit boolean not null default false,
  payment_required boolean not null default false,
  payment_authorized boolean not null default false,
  payment_settled boolean not null default false,
  execution_completed boolean not null default false,
  arc_proof_verified boolean not null default false,
  error_category text not null check (error_category in ('none', 'timeout', 'network', 'invalid_response', 'payment_failed', 'settlement_failed', 'execution_failed', 'verification_failed')),
  source text not null check (source in ('real_paid_execution', 'scheduled_probe', 'historical_execution')),
  created_at timestamptz not null default now(),
  check (completed_at >= started_at)
);

create index if not exists api_quality_obs_service_started_idx
  on public.api_quality_observations (service_id, started_at desc);

create index if not exists api_quality_obs_seller_started_idx
  on public.api_quality_observations (seller_public_id, started_at desc)
  where seller_public_id is not null;

create index if not exists api_quality_obs_started_idx
  on public.api_quality_observations (started_at desc);

create index if not exists api_quality_obs_source_created_idx
  on public.api_quality_observations (source, created_at desc);

alter table public.api_quality_observations enable row level security;

drop policy if exists "Allow service role full access to api_quality_observations" on public.api_quality_observations;
create policy "Allow service role full access to api_quality_observations"
  on public.api_quality_observations for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Allow public read access to api_quality_observations" on public.api_quality_observations;
create policy "Allow public read access to api_quality_observations"
  on public.api_quality_observations for select
  using (true);
