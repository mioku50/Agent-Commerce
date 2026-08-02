begin;

alter table public.project_360_module_runs
  add column if not exists provider text,
  add column if not exists retryable boolean not null default false,
  add column if not exists public_reason text,
  add column if not exists duration_ms integer,
  add column if not exists execution_telemetry jsonb not null default '{}'::jsonb;

alter table public.project_360_module_runs
  drop constraint if exists project_360_module_runs_status_check,
  drop constraint if exists project_360_module_runs_error_code_check,
  drop constraint if exists project_360_module_runs_provider_check,
  drop constraint if exists project_360_module_runs_public_reason_check,
  drop constraint if exists project_360_module_runs_duration_ms_check,
  drop constraint if exists project_360_module_runs_execution_telemetry_check;

update public.project_360_module_runs
set status = 'insufficient_data',
    error_code = case
      when error_code = 'unsupported' then 'insufficient_data'
      else error_code
    end,
    retryable = false,
    public_reason = coalesce(
      public_reason,
      'The confirmed source did not provide enough evidence for a numeric module score.'
    )
where status = 'unsupported';

update public.project_360_module_runs
set error_code = 'insufficient_data'
where error_code = 'unsupported';

alter table public.project_360_module_runs
  add constraint project_360_module_runs_status_check check (
    status in (
      'not_provided', 'not_selected', 'pending', 'running', 'completed',
      'insufficient_data', 'provider_unavailable', 'failed'
    )
  ),
  add constraint project_360_module_runs_error_code_check check (
    error_code is null or error_code in (
      'invalid_input', 'source_unavailable', 'timeout', 'provider_failure',
      'payment_failure', 'verification_delay', 'internal_error',
      'invalid_wallet', 'unsupported_network', 'missing_input', 'policy_denial',
      'insufficient_data', 'treasury_provider_unavailable',
      'treasury_provider_malformed_response'
    )
  ),
  add constraint project_360_module_runs_provider_check check (
    provider is null or provider in (
      'arcscan_blockscout', 'arc_json_rpc', 'treasury_input', 'internal'
    )
  ),
  add constraint project_360_module_runs_public_reason_check check (
    public_reason is null or char_length(public_reason) between 1 and 240
  ),
  add constraint project_360_module_runs_duration_ms_check check (
    duration_ms is null or duration_ms >= 0
  ),
  add constraint project_360_module_runs_execution_telemetry_check check (
    jsonb_typeof(execution_telemetry) = 'object'
    and (
      not (execution_telemetry ? 'attempts')
      or jsonb_typeof(execution_telemetry -> 'attempts') = 'array'
    )
  );

create index if not exists project_360_module_runs_retry_idx
  on public.project_360_module_runs (job_id, module, retryable, attempt_count);

commit;
