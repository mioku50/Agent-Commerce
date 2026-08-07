-- Migration: P5.2 — Veyra ERC-8004 Identity, Reputation & Validation Bridge
-- SPDX-License-Identifier: Apache-2.0

CREATE TABLE IF NOT EXISTS public.erc8004_agent_identity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL UNIQUE,
  registry_address TEXT NOT NULL,
  chain_id BIGINT NOT NULL DEFAULT 5042002,
  owner_address TEXT NOT NULL,
  metadata_uri TEXT NOT NULL,
  registration_tx TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erc8004_agent_identity_agent_id ON public.erc8004_agent_identity (agent_id);
ALTER TABLE public.erc8004_agent_identity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on erc8004_agent_identity" ON public.erc8004_agent_identity;
CREATE POLICY "Service role full access on erc8004_agent_identity"
  ON public.erc8004_agent_identity FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read access on erc8004_agent_identity" ON public.erc8004_agent_identity;
CREATE POLICY "Public read access on erc8004_agent_identity"
  ON public.erc8004_agent_identity FOR SELECT TO public USING (true);


CREATE TABLE IF NOT EXISTS public.erc8004_validation_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_hash TEXT NOT NULL UNIQUE,
  agent_id TEXT NOT NULL,
  evaluation_public_id TEXT REFERENCES public.erc8183_evaluations(public_id),
  canonical_report_hash TEXT NOT NULL,
  response INT2 NOT NULL CHECK (response IN (0, 100)),
  response_hash TEXT NOT NULL,
  response_tx TEXT,
  tag TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_erc8004_validation_links_request_hash ON public.erc8004_validation_links (request_hash);
CREATE INDEX IF NOT EXISTS idx_erc8004_validation_links_evaluation ON public.erc8004_validation_links (evaluation_public_id);
ALTER TABLE public.erc8004_validation_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on erc8004_validation_links" ON public.erc8004_validation_links;
CREATE POLICY "Service role full access on erc8004_validation_links"
  ON public.erc8004_validation_links FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read access for confirmed erc8004_validation_links" ON public.erc8004_validation_links;
CREATE POLICY "Public read access for confirmed erc8004_validation_links"
  ON public.erc8004_validation_links FOR SELECT TO public USING (status = 'confirmed');
