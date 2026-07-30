-- P3.1: canonical public trust profiles separated from private watchlist
-- management. Direct database access remains service-role only.

create table if not exists public.trust_profiles (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique
    default ('vtr_' || encode(extensions.gen_random_bytes(10), 'hex'))
    check (public_id ~ '^vtr_[0-9a-f]{20}$'),
  canonical_subject_key text not null unique
    check (char_length(canonical_subject_key) between 3 and 600),
  subject_type text not null check (
    subject_type in (
      'github_repository',
      'ai_agent',
      'wallet',
      'arc_contract',
      'service_endpoint'
    )
  ),
  canonical_subject_input jsonb not null
    check (jsonb_typeof(canonical_subject_input) = 'object'),
  display_name text not null check (char_length(display_name) between 2 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trust_watchlists
  add column if not exists profile_id uuid
    references public.trust_profiles(id) on delete restrict;
alter table public.trust_watchlists
  add column if not exists visibility text not null default 'private';
alter table public.trust_watchlists
  drop constraint if exists trust_watchlists_visibility_check;
alter table public.trust_watchlists
  add constraint trust_watchlists_visibility_check
  check (visibility in ('private', 'public'));

with candidates as (
  select
    watchlist.label,
    case
      when watchlist.subject_input ? 'serviceEndpoint'
        then jsonb_set(
          watchlist.subject_input,
          '{serviceEndpoint}',
          to_jsonb(regexp_replace(
            watchlist.subject_input ->> 'serviceEndpoint',
            '#.*$',
            ''
          ))
        )
      else watchlist.subject_input
    end as subject_input,
    watchlist.created_at,
    case
      when watchlist.subject_input ? 'agentId'
        then 'agent:' || lower(watchlist.subject_input ->> 'agentId')
      when watchlist.subject_input ? 'repositoryUrl'
        then 'github:' || lower(
          trim(trailing '/' from regexp_replace(
            watchlist.subject_input ->> 'repositoryUrl',
            '^https://github\.com/',
            ''
          ))
        )
      when watchlist.subject_input ? 'agentWallet'
        then 'wallet:' || lower(watchlist.subject_input ->> 'agentWallet')
      when watchlist.subject_input ? 'contractAddress'
        then 'arc-testnet-contract:' ||
          lower(watchlist.subject_input ->> 'contractAddress')
      else 'endpoint:' || regexp_replace(
        watchlist.subject_input ->> 'serviceEndpoint',
        '#.*$',
        ''
      )
    end as canonical_subject_key,
    case
      when watchlist.subject_input ? 'agentId' then 'ai_agent'
      when watchlist.subject_input ? 'repositoryUrl' then 'github_repository'
      when watchlist.subject_input ? 'agentWallet' then 'wallet'
      when watchlist.subject_input ? 'contractAddress' then 'arc_contract'
      else 'service_endpoint'
    end as subject_type
  from public.trust_watchlists watchlist
),
canonical as (
  select distinct on (candidate.canonical_subject_key)
    candidate.canonical_subject_key,
    candidate.subject_type,
    candidate.subject_input,
    candidate.label
  from candidates candidate
  order by candidate.canonical_subject_key, candidate.created_at asc
)
insert into public.trust_profiles (
  canonical_subject_key,
  subject_type,
  canonical_subject_input,
  display_name
)
select
  canonical.canonical_subject_key,
  canonical.subject_type,
  canonical.subject_input,
  left(canonical.label, 160)
from canonical
on conflict (canonical_subject_key) do nothing;

update public.trust_watchlists watchlist
set profile_id = profile.id,
    visibility = 'public'
from public.trust_profiles profile
where watchlist.profile_id is null
  and profile.canonical_subject_key = case
    when watchlist.subject_input ? 'agentId'
      then 'agent:' || lower(watchlist.subject_input ->> 'agentId')
    when watchlist.subject_input ? 'repositoryUrl'
      then 'github:' || lower(
        trim(trailing '/' from regexp_replace(
          watchlist.subject_input ->> 'repositoryUrl',
          '^https://github\.com/',
          ''
        ))
      )
    when watchlist.subject_input ? 'agentWallet'
      then 'wallet:' || lower(watchlist.subject_input ->> 'agentWallet')
    when watchlist.subject_input ? 'contractAddress'
      then 'arc-testnet-contract:' ||
        lower(watchlist.subject_input ->> 'contractAddress')
    else 'endpoint:' || regexp_replace(
      watchlist.subject_input ->> 'serviceEndpoint',
      '#.*$',
      ''
    )
  end;

do $$
begin
  if exists (
    select 1 from public.trust_watchlists where profile_id is null
  ) then
    raise exception 'P3.1 profile backfill left watchlists without a canonical profile';
  end if;
end;
$$;

alter table public.trust_watchlists
  alter column profile_id set not null;

drop index if exists public.trust_watchlists_owner_subject_tenant_idx;
create unique index if not exists trust_watchlists_owner_profile_tenant_idx
  on public.trust_watchlists (
    lower(owner_wallet),
    profile_id,
    coalesce(machine_credential_id::text, '')
  );
create index if not exists trust_watchlists_public_profile_idx
  on public.trust_watchlists (profile_id, last_recheck_at desc, created_at desc)
  where visibility = 'public';
create index if not exists trust_profiles_subject_type_idx
  on public.trust_profiles (subject_type, updated_at desc);

drop trigger if exists set_trust_profiles_updated_at on public.trust_profiles;
create trigger set_trust_profiles_updated_at
  before update on public.trust_profiles
  for each row execute function public.set_trust_monitoring_updated_at();

alter table public.trust_profiles enable row level security;
revoke all on table public.trust_profiles from anon, authenticated;
grant all on table public.trust_profiles to service_role;
drop policy if exists "Allow service access" on public.trust_profiles;
create policy "Allow service access" on public.trust_profiles
  for all to service_role using (true) with check (true);

comment on table public.trust_profiles is
  'Canonical trust identities with stable vtr public IDs; public visibility is explicitly controlled by owner watchlists.';
comment on column public.trust_watchlists.visibility is
  'Fail-closed publication setting. Private watchlists never resolve through public trust profile routes.';
