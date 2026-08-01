-- P4.2: free Project 360 discovery, immutable source selection, module runs,
-- and aggregate report binding. Direct access is service-role only.

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
  created_at timestamptz not null default now()
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

alter table public.project_360_discoveries enable row level security;
alter table public.project_360_candidates enable row level security;
alter table public.project_360_quotes enable row level security;
alter table public.project_360_module_runs enable row level security;

revoke all on table public.project_360_discoveries from anon, authenticated;
revoke all on table public.project_360_candidates from anon, authenticated;
revoke all on table public.project_360_quotes from anon, authenticated;
revoke all on table public.project_360_module_runs from anon, authenticated;

grant all on table public.project_360_discoveries to service_role;
grant all on table public.project_360_candidates to service_role;
grant all on table public.project_360_quotes to service_role;
grant all on table public.project_360_module_runs to service_role;
