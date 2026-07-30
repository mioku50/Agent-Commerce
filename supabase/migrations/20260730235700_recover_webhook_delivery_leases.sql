-- Recover delivery leases abandoned by a timed-out or interrupted worker.
-- A reclaimed row represents a new bounded attempt and therefore increments
-- attempt_count exactly once when it is claimed again.

create or replace function public.claim_due_webhook_deliveries_v1(p_limit integer)
returns setof public.webhook_deliveries
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select delivery.id
    from public.webhook_deliveries delivery
    join public.webhook_subscriptions subscription
      on subscription.id = delivery.subscription_id
    where (
        (
          delivery.status in ('pending', 'retry_scheduled')
          and delivery.next_attempt_at <= now()
        )
        or (
          delivery.status = 'delivering'
          and delivery.updated_at <= now() - interval '2 minutes'
        )
      )
      and delivery.attempt_count < 6
      and subscription.status = 'active'
    order by delivery.next_attempt_at asc
    for update of delivery skip locked
    limit greatest(0, least(coalesce(p_limit, 0), 25))
  )
  update public.webhook_deliveries delivery
  set status = 'delivering',
      attempt_count = delivery.attempt_count + 1,
      updated_at = now()
  from due
  where delivery.id = due.id
  returning delivery.*;
end;
$$;

revoke all on function public.claim_due_webhook_deliveries_v1(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_webhook_deliveries_v1(integer)
  to service_role;
