-- Persist Machine API quote ownership in first-class columns and inherit that
-- ownership atomically when hosted checkout creates the job.

alter table public.hosted_workflow_quotes
  add column if not exists byoa_agent_id uuid
    references public.byoa_agents(id) on delete set null,
  add column if not exists owner_wallet text
    check (
      owner_wallet is null
      or owner_wallet ~ '^0x[0-9a-fA-F]{40}$'
    );

create index if not exists hosted_workflow_quotes_byoa_agent_idx
  on public.hosted_workflow_quotes (byoa_agent_id, created_at desc)
  where byoa_agent_id is not null;

create index if not exists hosted_workflow_quotes_owner_wallet_idx
  on public.hosted_workflow_quotes (lower(owner_wallet), created_at desc)
  where owner_wallet is not null;

create or replace function public.inherit_machine_job_ownership_from_quote()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_quote public.hosted_workflow_quotes%rowtype;
  v_metadata jsonb;
  v_agent_text text;
begin
  if new.workflow_quote_id is null then
    return new;
  end if;

  select *
    into v_quote
    from public.hosted_workflow_quotes
   where id = new.workflow_quote_id;

  if not found then
    return new;
  end if;

  v_metadata := coalesce(v_quote.planner_snapshot -> 'metadata', '{}'::jsonb);
  v_agent_text := nullif(v_metadata ->> 'byoa_agent_id', '');

  new.byoa_agent_id := coalesce(
    new.byoa_agent_id,
    v_quote.byoa_agent_id,
    case
      when v_agent_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then v_agent_text::uuid
      else null
    end
  );
  new.machine_credential_id := coalesce(
    new.machine_credential_id,
    v_quote.machine_credential_id,
    nullif(v_metadata ->> 'machine_credential_id', '')
  );

  return new;
end;
$$;

drop trigger if exists inherit_machine_job_ownership_from_quote
  on public.hosted_agent_jobs;

create trigger inherit_machine_job_ownership_from_quote
  before insert or update of workflow_quote_id
  on public.hosted_agent_jobs
  for each row
  execute function public.inherit_machine_job_ownership_from_quote();

revoke all on function public.inherit_machine_job_ownership_from_quote()
  from public, anon, authenticated;

grant execute on function public.inherit_machine_job_ownership_from_quote()
  to service_role;
