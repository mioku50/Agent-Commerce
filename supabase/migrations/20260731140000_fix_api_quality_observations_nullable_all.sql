-- Migration: Drop NOT NULL constraints on API Quality Observations for all optional fields
-- Timestamp: 20260731140000

alter table public.api_quality_observations
  alter column completed_at drop not null,
  alter column quoted_price_usdc drop not null,
  alter column paid_amount_usdc drop not null,
  alter column latency_ms drop not null,
  alter column response_schema_valid drop not null,
  alter column response_within_size_limit drop not null,
  alter column payment_authorized drop not null,
  alter column payment_settled drop not null;
