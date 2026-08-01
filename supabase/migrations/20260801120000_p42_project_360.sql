-- P4.2: free Project 360 discovery, immutable source selection, module runs,
-- and aggregate report binding. Direct access is service-role only.

begin;

alter table public.hosted_workflow_quotes
  drop constraint if exists hosted_workflow_quotes_workflow_type_check;
alter table public.hosted_workflow_quotes
  add constraint hosted_workflow_quotes_workflow_type_check
  check (
    workflow_type in (
      'github_due_diligence', 'agent_trust_report', 'paid_api_quality',
      'treasury_health', 'project_360', 'sentiment_tone', 'builder_update',
      'market_context', 'custom_task'
    )
    or workflow_type ~ '^seller_[a-z0-9_]{3,80}$'
  ) not valid;
alter table public.hosted_workflow_quotes
  validate constraint hosted_workflow_quotes_workflow_type_check;

alter table public.hosted_agent_jobs
  drop constraint if exists hosted_agent_jobs_workflow_type_check;
alter table public.hosted_agent_jobs
  add constraint hosted_agent_jobs_workflow_type_check
  check (
    workflow_type in (
      'github_due_diligence', 'agent_trust_report', 'paid_api_quality',
      'treasury_health', 'project_360', 'sentiment_tone', 'builder_update',
      'market_context', 'custom_task'
    )
    or workflow_type ~ '^seller_[a-z0-9_]{3,80}$'
  ) not valid;
alter table public.hosted_agent_jobs
  validate constraint hosted_agent_jobs_workflow_type_check;

alter table public.byoa_agent_policies
  drop constraint if exists byoa_agent_policies_allowed_workflows_check;
alter table public.byoa_agent_policies
  add constraint byoa_agent_policies_allowed_workflows_check
  check (
    cardinality(allowed_workflows) between 1 and 16
    and array_to_string(allowed_workflows, ',') ~
      '^((\*|github_due_diligence|agent_trust_report|paid_api_quality|treasury_health|project_360|sentiment_tone|builder_update|market_context|custom_task|seller:\*|seller_[a-z0-9_]{3,80})(,(\*|github_due_diligence|agent_trust_report|paid_api_quality|treasury_health|project_360|sentiment_tone|builder_update|market_context|custom_task|seller:\*|seller_[a-z0-9_]{3,80}))*)$'
  ) not valid;
alter table public.byoa_agent_policies
  validate constraint byoa_agent_policies_allowed_workflows_check;

create table if not exists public.project_360_discoveries (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique
    default ('dsc_' || encode(extensions.gen_random_bytes(10), 'hex'))
    check (public_id ~ '^dsc_[0-9a-f]{20}$'),
  owner_wallet text not null check (owner_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  machine_credential_id uuid
    references public.byoa_agent_credentials(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'ready', 'failed', 'expired')),
  revision integer not null default 1 check (revision > 0),
  primary_type text not null check (
    primary_type in (
      'github_repository', 'project_wallet', 'agent_id',
      'arc_contract', 'public_api_endpoint'
    )
  ),
  primary_value text not null check (char_length(primary_value) between 3 and 500),
  primary_value_hash text not null check (primary_value_hash ~ '^[0-9a-f]{64}$'),
  idempotency_hash text not null check (idempotency_hash ~ '^[0-9a-f]{64}$'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  candidates_hash text check (
    candidates_hash is null or candidates_hash ~ '^[0-9a-f]{64}$'
  ),
  warnings jsonb not null default '[]'::jsonb
    check (jsonb_typeof(warnings) = 'array'),
  error_code text check (
    error_code is null or error_code ~ '^[a-z0-9_]{3,80}$'
  ),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists project_360_discoveries_browser_idem_idx
  on public.project_360_discoveries (lower(owner_wallet), idempotency_hash)
  where machine_credential_id is null;
create unique index if not exists project_360_discoveries_machine_idem_idx
  on public.project_360_discoveries (machine_credential_id, idempotency_hash)
  where machine_credential_id is not null;
create index if not exists project_360_discoveries_owner_created_idx
  on public.project_360_discoveries (lower(owner_wallet), created_at desc);
create index if not exists project_360_discoveries_machine_created_idx
  on public.project_360_discoveries (machine_credential_id, created_at desc)
  where machine_credential_id is not null;

create table if not exists public.project_360_candidates (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique
    default ('src_' || encode(extensions.gen_random_bytes(10), 'hex'))
    check (public_id ~ '^src_[0-9a-f]{20}$'),
  discovery_id uuid not null
    references public.project_360_discoveries(id) on delete cascade,
  source_type text not null check (
    source_type in (
      'github_repository', 'project_wallet', 'agent_id',
      'arc_contract', 'public_api_endpoint'
    )
  ),
  module text not null check (
    module in (
      'github_due_diligence', 'agent_trust_report', 'treasury_health',
      'paid_api_quality', 'arc_contract_analysis'
    )
  ),
  canonical_value text not null check (char_length(canonical_value) between 3 and 500),
  value_hash text not null check (value_hash ~ '^[0-9a-f]{64}$'),
  origin_kind text not null check (origin_kind in ('primary', 'github_file', 'public_record')),
  origin_repository text check (
    origin_repository is null or char_length(origin_repository) between 3 and 200
  ),
  file_path text check (file_path is null or char_length(file_path) between 1 and 240),
  line_start integer check (line_start is null or line_start > 0),
  line_end integer check (line_end is null or line_end >= line_start),
  safe_excerpt text check (safe_excerpt is null or char_length(safe_excerpt) <= 300),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  confidence_score numeric(4,3) not null check (
    confidence_score >= 0.4 and confidence_score <= 1
  ),
  reason_code text not null check (reason_code ~ '^[a-z0-9_]{3,80}$'),
  validation_status text not null default 'valid'
    check (validation_status in ('valid', 'unsupported', 'blocked')),
  origin_fingerprint text not null check (origin_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  constraint project_360_candidates_provenance_key
    unique (discovery_id, source_type, value_hash, origin_fingerprint)
);

create index if not exists project_360_candidates_discovery_idx
  on public.project_360_candidates (discovery_id, source_type, confidence_score desc);

create table if not exists public.project_360_quotes (
  quote_id uuid primary key
    references public.hosted_workflow_quotes(id) on delete cascade,
  discovery_id uuid not null
    references public.project_360_discoveries(id) on delete restrict,
  discovery_revision integer not null check (discovery_revision > 0),
  candidates_hash text not null check (candidates_hash ~ '^[0-9a-f]{64}$'),
  selection_hash text not null check (selection_hash ~ '^[0-9a-f]{64}$'),
  selected_candidate_ids jsonb not null
    check (jsonb_typeof(selected_candidate_ids) = 'array'),
  confirmed_sources jsonb not null check (jsonb_typeof(confirmed_sources) = 'array'),
  module_price_snapshot jsonb not null
    check (jsonb_typeof(module_price_snapshot) = 'array'),
  expected_coverage_count integer not null check (expected_coverage_count between 1 and 5),
  warnings jsonb not null default '[]'::jsonb
    check (jsonb_typeof(warnings) = 'array'),
  created_at timestamptz not null default now(),
  constraint project_360_quotes_selection_count_check check (
    jsonb_array_length(selected_candidate_ids) between 1 and 5
    and jsonb_array_length(confirmed_sources) = jsonb_array_length(selected_candidate_ids)
    and expected_coverage_count = jsonb_array_length(selected_candidate_ids)
  )
);

create index if not exists project_360_quotes_discovery_idx
  on public.project_360_quotes (discovery_id, created_at desc);

create table if not exists public.project_360_module_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.hosted_agent_jobs(id) on delete cascade,
  module text not null check (
    module in (
      'github_due_diligence', 'agent_trust_report', 'treasury_health',
      'paid_api_quality', 'arc_contract_analysis'
    )
  ),
  status text not null default 'pending' check (
    status in (
      'not_provided', 'not_selected', 'pending', 'running',
      'completed', 'failed', 'unsupported'
    )
  ),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  child_report_hash text check (
    child_report_hash is null or child_report_hash ~ '^0x[0-9a-fA-F]{64}$'
  ),
  score integer check (score is null or score between 0 and 100),
  confidence text not null default 'insufficient'
    check (confidence in ('high', 'medium', 'low', 'insufficient')),
  result_snapshot jsonb check (
    result_snapshot is null or jsonb_typeof(result_snapshot) = 'object'
  ),
  error_code text check (
    error_code is null or error_code in (
      'invalid_input', 'source_unavailable', 'timeout', 'provider_failure',
      'payment_failure', 'verification_delay', 'unsupported', 'internal_error'
    )
  ),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint project_360_module_runs_job_module_key unique (job_id, module)
);

create index if not exists project_360_module_runs_job_status_idx
  on public.project_360_module_runs (job_id, status, module);

create or replace function public.set_project_360_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_project_360_discoveries_updated_at
  on public.project_360_discoveries;
create trigger set_project_360_discoveries_updated_at
  before update on public.project_360_discoveries
  for each row execute function public.set_project_360_updated_at();

drop trigger if exists set_project_360_module_runs_updated_at
  on public.project_360_module_runs;
create trigger set_project_360_module_runs_updated_at
  before update on public.project_360_module_runs
  for each row execute function public.set_project_360_updated_at();

create or replace function public.validate_project_360_discovery_tenant()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_credential_owner text;
begin
  if new.machine_credential_id is null then
    return new;
  end if;

  select credential.owner_wallet
    into v_credential_owner
    from public.byoa_agent_credentials credential
   where credential.id = new.machine_credential_id;

  if v_credential_owner is null
     or lower(v_credential_owner) <> lower(new.owner_wallet) then
    raise exception 'project 360 discovery tenant mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_project_360_discovery_tenant
  on public.project_360_discoveries;
create trigger validate_project_360_discovery_tenant
  before insert or update of owner_wallet, machine_credential_id
  on public.project_360_discoveries
  for each row execute function public.validate_project_360_discovery_tenant();

create or replace function public.validate_project_360_quote_binding()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_quote public.hosted_workflow_quotes%rowtype;
  v_discovery public.project_360_discoveries%rowtype;
  v_selected_count integer;
  v_confirmed_count integer;
begin
  select * into v_quote
    from public.hosted_workflow_quotes
   where id = new.quote_id;
  select * into v_discovery
    from public.project_360_discoveries
   where id = new.discovery_id;

  if v_quote.id is null
     or v_discovery.id is null
     or v_quote.workflow_type <> 'project_360'
     or lower(coalesce(v_quote.owner_wallet, v_quote.requester_wallet)) <>
        lower(v_discovery.owner_wallet)
     or coalesce(v_quote.machine_credential_id, '') <>
        coalesce(v_discovery.machine_credential_id::text, '') then
    raise exception 'project 360 quote tenant mismatch';
  end if;

  if v_discovery.status <> 'ready'
     or new.discovery_revision <> v_discovery.revision
     or new.candidates_hash <> v_discovery.candidates_hash then
    raise exception 'project 360 discovery snapshot mismatch';
  end if;

  select count(*) into v_selected_count
    from public.project_360_candidates candidate
   where candidate.discovery_id = new.discovery_id
     and candidate.validation_status = 'valid'
     and candidate.public_id in (
       select jsonb_array_elements_text(new.selected_candidate_ids)
     );

  if v_selected_count <> jsonb_array_length(new.selected_candidate_ids) then
    raise exception 'project 360 selected candidate mismatch';
  end if;

  select count(*) into v_confirmed_count
    from jsonb_array_elements(new.confirmed_sources) source
    join public.project_360_candidates candidate
      on candidate.discovery_id = new.discovery_id
     and candidate.public_id = source ->> 'candidateId'
     and candidate.source_type = source ->> 'type'
     and candidate.module = source ->> 'module'
     and candidate.canonical_value = source ->> 'canonicalValue'
     and candidate.value_hash = source ->> 'valueHash';

  if v_confirmed_count <> jsonb_array_length(new.confirmed_sources) then
    raise exception 'project 360 confirmed source mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_project_360_quote_binding
  on public.project_360_quotes;
create trigger validate_project_360_quote_binding
  before insert on public.project_360_quotes
  for each row execute function public.validate_project_360_quote_binding();

create or replace function public.reject_project_360_quote_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  raise exception 'project 360 quote snapshots are immutable';
end;
$$;

drop trigger if exists reject_project_360_quote_mutation
  on public.project_360_quotes;
create trigger reject_project_360_quote_mutation
  before update or delete on public.project_360_quotes
  for each row execute function public.reject_project_360_quote_mutation();

create or replace function public.reject_quoted_project_360_candidate_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_discovery_id uuid := case when tg_op = 'DELETE' then old.discovery_id else new.discovery_id end;
begin
  if exists (
    select 1
      from public.project_360_quotes quote_snapshot
     where quote_snapshot.discovery_id = v_discovery_id
  ) then
    raise exception 'quoted project 360 candidates are immutable';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists reject_quoted_project_360_candidate_mutation
  on public.project_360_candidates;
create trigger reject_quoted_project_360_candidate_mutation
  before insert or update or delete on public.project_360_candidates
  for each row execute function public.reject_quoted_project_360_candidate_mutation();

create or replace function public.reject_quoted_project_360_discovery_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
      from public.project_360_quotes quote_snapshot
     where quote_snapshot.discovery_id = old.id
  ) and (
    new.owner_wallet is distinct from old.owner_wallet
    or new.machine_credential_id is distinct from old.machine_credential_id
    or new.revision is distinct from old.revision
    or new.primary_type is distinct from old.primary_type
    or new.primary_value is distinct from old.primary_value
    or new.primary_value_hash is distinct from old.primary_value_hash
    or new.candidates_hash is distinct from old.candidates_hash
  ) then
    raise exception 'quoted project 360 discovery snapshots are immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists reject_quoted_project_360_discovery_mutation
  on public.project_360_discoveries;
create trigger reject_quoted_project_360_discovery_mutation
  before update on public.project_360_discoveries
  for each row execute function public.reject_quoted_project_360_discovery_mutation();

create or replace function public.validate_project_360_module_run_tenant()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_job public.hosted_agent_jobs%rowtype;
  v_discovery public.project_360_discoveries%rowtype;
begin
  select job.* into v_job
    from public.hosted_agent_jobs job
    join public.project_360_quotes quote_snapshot
      on quote_snapshot.quote_id = job.workflow_quote_id
   where job.id = new.job_id;

  select discovery.* into v_discovery
    from public.project_360_discoveries discovery
    join public.project_360_quotes quote_snapshot
      on quote_snapshot.discovery_id = discovery.id
    join public.hosted_agent_jobs job
      on job.workflow_quote_id = quote_snapshot.quote_id
   where job.id = new.job_id;

  if v_job.id is null
     or v_discovery.id is null
     or v_job.workflow_type <> 'project_360'
     or v_job.requester_wallet is null
     or lower(v_job.requester_wallet) <> lower(v_discovery.owner_wallet)
     or coalesce(v_job.machine_credential_id, '') <>
        coalesce(v_discovery.machine_credential_id::text, '') then
    raise exception 'project 360 module run tenant mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_project_360_module_run_tenant
  on public.project_360_module_runs;
create trigger validate_project_360_module_run_tenant
  before insert or update of job_id on public.project_360_module_runs
  for each row execute function public.validate_project_360_module_run_tenant();

alter table public.project_360_discoveries enable row level security;
alter table public.project_360_candidates enable row level security;
alter table public.project_360_quotes enable row level security;
alter table public.project_360_module_runs enable row level security;

revoke all on table public.project_360_discoveries from public, anon, authenticated;
revoke all on table public.project_360_candidates from public, anon, authenticated;
revoke all on table public.project_360_quotes from public, anon, authenticated;
revoke all on table public.project_360_module_runs from public, anon, authenticated;

revoke all on function public.set_project_360_updated_at()
  from public, anon, authenticated;
revoke all on function public.validate_project_360_discovery_tenant()
  from public, anon, authenticated;
revoke all on function public.validate_project_360_quote_binding()
  from public, anon, authenticated;
revoke all on function public.reject_project_360_quote_mutation()
  from public, anon, authenticated;
revoke all on function public.reject_quoted_project_360_candidate_mutation()
  from public, anon, authenticated;
revoke all on function public.reject_quoted_project_360_discovery_mutation()
  from public, anon, authenticated;
revoke all on function public.validate_project_360_module_run_tenant()
  from public, anon, authenticated;

grant all on table public.project_360_discoveries to service_role;
grant all on table public.project_360_candidates to service_role;
grant all on table public.project_360_quotes to service_role;
grant all on table public.project_360_module_runs to service_role;

grant execute on function public.set_project_360_updated_at()
  to service_role;
grant execute on function public.validate_project_360_discovery_tenant()
  to service_role;
grant execute on function public.validate_project_360_quote_binding()
  to service_role;
grant execute on function public.reject_project_360_quote_mutation()
  to service_role;
grant execute on function public.reject_quoted_project_360_candidate_mutation()
  to service_role;
grant execute on function public.reject_quoted_project_360_discovery_mutation()
  to service_role;
grant execute on function public.validate_project_360_module_run_tenant()
  to service_role;

commit;
