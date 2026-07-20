-- Phase 28 hardening: revalidate the registered agent and its current policy
-- under the quote lock immediately before the x402 settlement lease is issued.

create or replace function public.claim_byoa_quote_settlement_v1(
  p_quote_id uuid,
  p_credential_id uuid
)
returns table (claim_token uuid, reason text, job_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
  v_quote public.byoa_workflow_quotes%rowtype;
  v_agent public.byoa_agents%rowtype;
  v_credential public.byoa_agent_credentials%rowtype;
  v_policy public.byoa_agent_policies%rowtype;
  v_reservation public.byoa_policy_reservations%rowtype;
  v_token uuid := gen_random_uuid();
begin
  select * into v_quote from public.byoa_workflow_quotes where id = p_quote_id for update;
  if v_quote.id is null then return query select null::uuid, 'not_found'::text, null::uuid; return; end if;
  if v_quote.status in ('consumed','completed') and v_quote.job_id is not null then
    return query select null::uuid, 'idempotent'::text, v_quote.job_id; return;
  end if;
  if v_quote.status in ('credited','failed','expired','cancelled') then
    return query select null::uuid, v_quote.status, v_quote.job_id; return;
  end if;
  if v_quote.expires_at <= now() then
    update public.byoa_workflow_quotes set status = 'expired' where id = v_quote.id;
    update public.byoa_policy_reservations set status = 'released', released_at = now()
      where quote_id = v_quote.id and status = 'reserved';
    return query select null::uuid, 'expired'::text, null::uuid; return;
  end if;

  select * into v_agent from public.byoa_agents where id = v_quote.agent_id for update;
  select * into v_policy from public.byoa_agent_policies where agent_id = v_quote.agent_id for update;
  select * into v_reservation from public.byoa_policy_reservations where quote_id = v_quote.id for update;
  if v_agent.id is null or v_agent.status <> 'active'
    or v_agent.agent_wallet_status <> 'verified' or v_agent.agent_wallet is null
    or not v_agent.canary_enabled then
    return query select null::uuid, 'agent_inactive'::text, null::uuid; return;
  end if;
  if v_policy.agent_id is null or v_policy.status <> 'active'
    or not (v_quote.workflow_type = any(v_policy.allowed_workflows))
    or exists (
      select 1 from unnest(v_quote.service_types) value
      where not (value = any(v_policy.allowed_service_types))
    )
    or v_quote.price_usdc > v_policy.max_price_per_run_usdc then
    return query select null::uuid, 'policy_denied'::text, null::uuid; return;
  end if;
  if v_reservation.id is null or v_reservation.status <> 'reserved'
    or v_reservation.expires_at <= now() then
    return query select null::uuid, 'allowance_unavailable'::text, null::uuid; return;
  end if;

  select * into v_credential from public.byoa_agent_credentials where id = p_credential_id for update;
  if v_credential.id is null or v_credential.agent_id <> v_quote.agent_id
    or v_credential.revoked_at is not null or v_credential.expires_at <= now()
    or not ('workflows:execute' = any(v_credential.scopes)) then
    return query select null::uuid, 'credential_denied'::text, null::uuid; return;
  end if;
  if v_quote.status = 'settling' and v_quote.settle_claim_expires_at > now() then
    return query select null::uuid, 'settlement_in_progress'::text, null::uuid; return;
  end if;

  update public.byoa_workflow_quotes
  set status = 'settling', settle_claim_token = v_token,
      settle_claim_expires_at = now() + interval '45 seconds'
  where id = v_quote.id;
  return query select v_token, 'claimed'::text, null::uuid;
end;
$$;

revoke all on function public.claim_byoa_quote_settlement_v1(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.claim_byoa_quote_settlement_v1(uuid,uuid)
  to service_role;
