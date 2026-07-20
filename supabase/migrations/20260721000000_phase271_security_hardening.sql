-- supabase/migrations/20260721000000_phase271_security_hardening.sql

-- Ensure default value for verification status columns if they exist
ALTER TABLE public.store_services
  ALTER COLUMN wallet_verification_status SET DEFAULT 'unverified',
  ALTER COLUMN endpoint_verification_status SET DEFAULT 'unverified';

-- Add DB-level check: external_seller in live status requires both verifications
ALTER TABLE public.store_services
  ADD CONSTRAINT external_seller_live_requires_verification
  CHECK (
    NOT (
      source_type = 'external_seller' AND status = 'live'
      AND (wallet_verification_status IS DISTINCT FROM 'verified'
           OR endpoint_verification_status IS DISTINCT FROM 'verified')
    )
  );
