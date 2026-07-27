-- P2.0.3: make BYOA Workflow and Machine API credentials explicit and
-- non-interchangeable. Existing legacy credentials are migrated to the only
-- namespace their historical scopes identify, then normalized to that type's
-- closed permission set.

alter table public.byoa_agent_credentials
  add column if not exists owner_wallet text,
  add column if not exists credential_type text;

update public.byoa_agent_credentials credential
set owner_wallet = agent.owner_wallet
from public.byoa_agents agent
where agent.id = credential.agent_id
  and credential.owner_wallet is null;

update public.byoa_agent_credentials
set credential_type = case
  when scopes <@ array[
    'manifest:read',
    'quotes:create',
    'workflows:execute',
    'results:read'
  ]::text[] then 'byoa_workflow'
  else 'machine_api'
end
where credential_type is null;

update public.byoa_agent_credentials
set scopes = case credential_type
  when 'machine_api' then array[
    'workflows:read',
    'quotes:create',
    'runs:create',
    'results:read'
  ]::text[]
  else array[
    'manifest:read',
    'quotes:create',
    'workflows:execute',
    'results:read'
  ]::text[]
end;

alter table public.byoa_agent_credentials
  alter column owner_wallet set not null,
  alter column credential_type set not null;

alter table public.byoa_agent_credentials
  drop constraint if exists byoa_agent_credentials_owner_wallet_check,
  drop constraint if exists byoa_agent_credentials_credential_type_check,
  drop constraint if exists byoa_agent_credentials_scopes_check;

alter table public.byoa_agent_credentials
  add constraint byoa_agent_credentials_owner_wallet_check
    check (owner_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  add constraint byoa_agent_credentials_credential_type_check
    check (credential_type in ('byoa_workflow', 'machine_api')),
  add constraint byoa_agent_credentials_scopes_check
    check (
      cardinality(scopes) = 4
      and (
        (
          credential_type = 'byoa_workflow'
          and scopes <@ array[
            'manifest:read',
            'quotes:create',
            'workflows:execute',
            'results:read'
          ]::text[]
          and array[
            'manifest:read',
            'quotes:create',
            'workflows:execute',
            'results:read'
          ]::text[] <@ scopes
        )
        or
        (
          credential_type = 'machine_api'
          and scopes <@ array[
            'workflows:read',
            'quotes:create',
            'runs:create',
            'results:read'
          ]::text[]
          and array[
            'workflows:read',
            'quotes:create',
            'runs:create',
            'results:read'
          ]::text[] <@ scopes
        )
      )
    );

create or replace function public.enforce_byoa_credential_owner_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_wallet text;
begin
  select owner_wallet into v_owner_wallet
  from public.byoa_agents
  where id = new.agent_id;

  if v_owner_wallet is null or lower(v_owner_wallet) <> lower(new.owner_wallet) then
    raise exception 'credential owner does not match agent owner';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_byoa_credential_owner on public.byoa_agent_credentials;
create trigger enforce_byoa_credential_owner
before insert or update of agent_id, owner_wallet
on public.byoa_agent_credentials
for each row execute function public.enforce_byoa_credential_owner_v1();

create or replace function public.rotate_byoa_credential_v1(
  p_owner_wallet text,
  p_agent_id uuid,
  p_previous_credential_id uuid,
  p_label text,
  p_token_prefix text,
  p_credential_hash text,
  p_scopes text[],
  p_expires_at timestamptz
)
returns table (credential_id uuid, reason text)
language plpgsql security definer set search_path = public
as $$
declare
  v_agent public.byoa_agents%rowtype;
  v_previous public.byoa_agent_credentials%rowtype;
  v_credential_id uuid;
begin
  select * into v_agent from public.byoa_agents
  where id = p_agent_id and lower(owner_wallet) = lower(p_owner_wallet)
  for update;
  if v_agent.id is null then
    return query select null::uuid, 'agent_not_found'::text;
    return;
  end if;

  select * into v_previous from public.byoa_agent_credentials
  where id = p_previous_credential_id
    and agent_id = p_agent_id
    and revoked_at is null
  for update;
  if v_previous.id is null then
    return query select null::uuid, 'credential_not_found'::text;
    return;
  end if;

  if p_scopes <> v_previous.scopes then
    return query select null::uuid, 'scope_change_denied'::text;
    return;
  end if;

  insert into public.byoa_agent_credentials (
    agent_id, owner_wallet, credential_type, label, token_prefix,
    credential_hash, scopes, expires_at, rotated_from_id
  ) values (
    p_agent_id, v_previous.owner_wallet, v_previous.credential_type, p_label,
    p_token_prefix, p_credential_hash, p_scopes, p_expires_at, v_previous.id
  ) returning id into v_credential_id;

  update public.byoa_agent_credentials
  set revoked_at = now()
  where id = v_previous.id and revoked_at is null;

  return query select v_credential_id, 'rotated'::text;
end;
$$;

revoke all on function public.enforce_byoa_credential_owner_v1() from public, anon, authenticated;
