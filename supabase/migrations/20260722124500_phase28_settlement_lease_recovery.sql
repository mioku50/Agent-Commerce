-- Phase 28 hardening: an exact recorded settlement may be consumed after the
-- short settlement lease expires, provided no newer claimant replaced its token.

create or replace function public.consume_byoa_quote_v1(
  p_quote_id uuid,
  p_claim_token uuid,
  p_payment_event_id uuid
)
returns table (job_id uuid, payment_id uuid, created boolean, reason text)
language plpgsql security definer set search_path = public
as $$
declare
  v_quote public.byoa_workflow_quotes%rowtype;
  v_agent public.byoa_agents%rowtype;
  v_event public.payment_events%rowtype;
  v_payment_id uuid;
  v_job_id uuid;
  v_active_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('hosted_agent_jobs_launch_v1'));
  select * into v_quote from public.byoa_workflow_quotes where id = p_quote_id for update;
  if v_quote.id is null then return query select null::uuid, null::uuid, false, 'not_found'::text; return; end if;
  if v_quote.job_id is not null then
    select id into v_payment_id from public.byoa_workflow_payments where quote_id = v_quote.id;
    return query select v_quote.job_id, v_payment_id, false, 'idempotent'::text; return;
  end if;
  if v_quote.status <> 'settling' or v_quote.settle_claim_token <> p_claim_token then
    return query select null::uuid, null::uuid, false, 'claim_invalid'::text; return;
  end if;

  select * into v_agent from public.byoa_agents where id = v_quote.agent_id for update;
  select * into v_event from public.payment_events where id = p_payment_event_id for update;
  if v_agent.id is null or v_agent.status <> 'active' or v_agent.agent_wallet_status <> 'verified'
    or v_agent.agent_wallet is null or not v_agent.canary_enabled then
    return query select null::uuid, null::uuid, false, 'agent_inactive'::text; return;
  end if;
  if v_event.id is null
    or v_event.endpoint <> v_quote.resource_path
    or lower(v_event.payer) <> lower(v_agent.agent_wallet)
    or v_event.amount_usdc::numeric <> v_quote.price_usdc
    or v_event.network <> v_quote.network
    or lower(coalesce(v_event.onchain_seller, '')) <> lower(v_quote.pay_to) then
    return query select null::uuid, null::uuid, false, 'payment_mismatch'::text; return;
  end if;

  select id into v_active_id from public.hosted_agent_jobs
  where status in ('queued','running') order by created_at asc limit 1;

  insert into public.byoa_workflow_payments (
    agent_id, quote_id, payment_event_id, payer_wallet, amount_usdc,
    gateway_transaction, status
  ) values (
    v_quote.agent_id, v_quote.id, v_event.id, v_event.payer, v_quote.price_usdc,
    v_event.gateway_tx, case when v_active_id is null then 'settled' else 'credit_issued' end
  ) returning id into v_payment_id;

  if v_active_id is not null then
    insert into public.byoa_workflow_credits (payment_id, agent_id, amount_usdc, reason)
    values (v_payment_id, v_quote.agent_id, v_quote.price_usdc,
      'The project-owned downstream payer already had an active hosted workflow after aggregate x402 settlement.');
    update public.byoa_workflow_quotes
      set status = 'credited', aggregate_payment_event_id = v_event.id,
          settle_claim_token = null, settle_claim_expires_at = null, consumed_at = now()
      where id = v_quote.id;
    update public.byoa_policy_reservations set status = 'released', released_at = now()
      where quote_id = v_quote.id and status = 'reserved';
    return query select null::uuid, v_payment_id, false, 'credit_issued'::text; return;
  end if;

  insert into public.hosted_agent_jobs (
    idempotency_hash, request_hash, requester_fingerprint, requester_wallet,
    workflow_type, task, input_text, input_preview, input_hash, budget_usdc,
    planner_snapshot, selected_services, status, progress_stage, payment_mode,
    byoa_agent_id, byoa_quote_id, aggregate_payment_event_id, raw
  ) values (
    v_quote.idempotency_hash, v_quote.request_hash, v_quote.requester_fingerprint,
    v_agent.agent_wallet, v_quote.workflow_type, v_quote.task, null,
    v_quote.input_preview, v_quote.input_hash, v_quote.budget_usdc,
    v_quote.planner_snapshot, v_quote.selected_services, 'queued', 'queued', 'paid',
    v_quote.agent_id, v_quote.id, v_event.id,
    jsonb_build_object('executionMode','byoa','agentPublicId',v_agent.public_id)
  ) returning id into v_job_id;

  update public.byoa_workflow_payments set job_id = v_job_id where id = v_payment_id;
  update public.byoa_workflow_quotes
    set status = 'consumed', aggregate_payment_event_id = v_event.id, job_id = v_job_id,
        settle_claim_token = null, settle_claim_expires_at = null, consumed_at = now()
    where id = v_quote.id;
  update public.byoa_policy_reservations set status = 'consumed', consumed_at = now()
    where quote_id = v_quote.id and status = 'reserved';

  return query select v_job_id, v_payment_id, true, 'created'::text;
end;
$$;

revoke all on function public.consume_byoa_quote_v1(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.consume_byoa_quote_v1(uuid,uuid,uuid)
  to service_role;
