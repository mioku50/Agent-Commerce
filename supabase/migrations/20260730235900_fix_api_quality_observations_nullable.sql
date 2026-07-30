-- Migration: Corrective Nullable Columns and Strict RLS for API Quality Observations
-- Timestamp: 20260730235900

-- Make completed_at nullable for timeout / in-flight observations
alter table public.api_quality_observations
  alter column completed_at drop not null;

-- Revoke public SELECT access policies
drop policy if exists public_read_observations on public.api_quality_observations;
drop policy if exists "Allow public read access to api_quality_observations" on public.api_quality_observations;

-- Ensure RLS is enabled
alter table public.api_quality_observations enable row level security;

-- Grant service_role full read/write access
drop policy if exists "Allow service role full access to api_quality_observations" on public.api_quality_observations;
create policy "Allow service role full access to api_quality_observations"
  on public.api_quality_observations for all
  to service_role
  using (true)
  with check (true);

grant all on public.api_quality_observations to service_role;
revoke select on public.api_quality_observations from anon, authenticated, public;
