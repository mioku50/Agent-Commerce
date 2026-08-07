-- Migration: P5.0 — Veyra ERC-8183 Evaluator MVP
-- SPDX-License-Identifier: Apache-2.0

CREATE TABLE IF NOT EXISTS public.erc8183_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT NOT NULL UNIQUE,
  chain_id BIGINT NOT NULL DEFAULT 5042002,
  agentic_commerce TEXT NOT NULL,
  job_id TEXT NOT NULL,
  client_wallet TEXT NOT NULL,
  provider_wallet TEXT NOT NULL,
  evaluator_contract TEXT NOT NULL,
  deliverable_hash TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  content_uri TEXT NOT NULL,
  policy_id TEXT NOT NULL DEFAULT 'structured-deliverable-v1',
  policy_hash TEXT NOT NULL,
  decision TEXT CHECK (decision IN ('complete', 'reject')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'evaluating', 'retryable', 'completed', 'rejected')),
  failure_category TEXT,
  canonical_report JSONB,
  report_hash TEXT,
  verdict_digest TEXT UNIQUE,
  settlement_tx_hash TEXT,
  settlement_block_number BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evaluated_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  CONSTRAINT erc8183_evaluations_chain_commerce_job_unique UNIQUE (chain_id, agentic_commerce, job_id)
);

CREATE INDEX IF NOT EXISTS idx_erc8183_evaluations_public_id ON public.erc8183_evaluations (public_id);
CREATE INDEX IF NOT EXISTS idx_erc8183_evaluations_job ON public.erc8183_evaluations (chain_id, agentic_commerce, job_id);
CREATE INDEX IF NOT EXISTS idx_erc8183_evaluations_settlement_tx ON public.erc8183_evaluations (settlement_tx_hash) WHERE settlement_tx_hash IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.erc8183_evaluations ENABLE ROW LEVEL SECURITY;

-- Service role has full read/write access
DROP POLICY IF EXISTS "Service role full access on erc8183_evaluations" ON public.erc8183_evaluations;
CREATE POLICY "Service role full access on erc8183_evaluations"
  ON public.erc8183_evaluations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Public read access for completed / rejected public evaluations
DROP POLICY IF EXISTS "Public read access for terminal erc8183_evaluations" ON public.erc8183_evaluations;
CREATE POLICY "Public read access for terminal erc8183_evaluations"
  ON public.erc8183_evaluations
  FOR SELECT
  TO public
  USING (status IN ('completed', 'rejected'));
