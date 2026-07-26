-- Atomically reserve a Machine API idempotency key so concurrent serverless
-- invocations cannot both execute the same mutation.

create or replace function public.reserve_machine_api_idempotency_v1(
  p_credential_id text,
  p_agent_id text,
  p_route text,
  p_idempotency_key_hash text,
  p_request_hash text,
  p_expires_at timestamptz
)
returns table (
  reservation_outcome text,
  cached_status integer,
  cached_body jsonb
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_record public.machine_api_idempotency%rowtype;
begin
  insert into public.machine_api_idempotency (
    credential_id,
    agent_id,
    route,
    idempotency_key_hash,
    request_hash,
    expires_at
  )
  values (
    p_credential_id,
    p_agent_id,
    p_route,
    p_idempotency_key_hash,
    p_request_hash,
    p_expires_at
  )
  on conflict (credential_id, route, idempotency_key_hash) do nothing
  returning * into v_record;

  if found then
    return query select 'reserved'::text, null::integer, null::jsonb;
    return;
  end if;

  select *
    into v_record
    from public.machine_api_idempotency
   where credential_id = p_credential_id
     and route = p_route
     and idempotency_key_hash = p_idempotency_key_hash
   for update;

  if not found then
    raise exception 'Machine API idempotency reservation disappeared.';
  end if;

  -- Completed responses remain replayable for the full TTL. An unfinished
  -- reservation is only a short lease so a crashed invocation cannot block
  -- the key for 24 hours.
  if v_record.expires_at <= now()
     or (
       v_record.response_status is null
       and v_record.created_at <= now() - interval '5 minutes'
     ) then
    update public.machine_api_idempotency
       set agent_id = p_agent_id,
           request_hash = p_request_hash,
           response_status = null,
           response_body = null,
           resource_type = null,
           resource_id = null,
           created_at = now(),
           expires_at = p_expires_at
     where id = v_record.id;

    return query select 'reserved'::text, null::integer, null::jsonb;
    return;
  end if;

  if v_record.request_hash <> p_request_hash then
    return query select 'conflict'::text, null::integer, null::jsonb;
    return;
  end if;

  if v_record.response_status is not null then
    return query
      select
        'cached'::text,
        v_record.response_status,
        v_record.response_body;
    return;
  end if;

  return query select 'pending'::text, null::integer, null::jsonb;
end;
$$;

revoke all on function public.reserve_machine_api_idempotency_v1(
  text,
  text,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.reserve_machine_api_idempotency_v1(
  text,
  text,
  text,
  text,
  text,
  timestamptz
) to service_role;

comment on function public.reserve_machine_api_idempotency_v1(
  text,
  text,
  text,
  text,
  text,
  timestamptz
) is 'Atomically reserves or resolves a credential-scoped Machine API idempotency key.';
