-- supabase/migrations/20260721000000_phase271_security_hardening.sql

-- The preceding Phase 27 migration shared a legacy timestamp with another
-- migration. Repair the two columns here before applying constraints so a
-- ledger collision cannot leave this migration permanently blocked.
ALTER TABLE public.store_services
  ADD COLUMN IF NOT EXISTS wallet_verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS endpoint_verification_status text NOT NULL DEFAULT 'unverified';

ALTER TABLE public.store_services
  ALTER COLUMN wallet_verification_status SET DEFAULT 'unverified',
  ALTER COLUMN endpoint_verification_status SET DEFAULT 'unverified';

-- Add DB-level check: external_seller in live status requires both verifications
ALTER TABLE public.store_services
  DROP CONSTRAINT IF EXISTS external_seller_live_requires_verification;

ALTER TABLE public.store_services
  ADD CONSTRAINT external_seller_live_requires_verification
  CHECK (
    NOT (
      source_type = 'external_seller' AND status = 'live'
      AND (wallet_verification_status IS DISTINCT FROM 'verified'
           OR endpoint_verification_status IS DISTINCT FROM 'verified')
    )
  );
