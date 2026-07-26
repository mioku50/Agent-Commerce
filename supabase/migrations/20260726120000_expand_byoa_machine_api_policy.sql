-- Keep BYOA management policy constraints aligned with the Machine API v1
-- workflow and credential contracts.

alter table public.byoa_agent_policies
  drop constraint if exists byoa_agent_policies_allowed_workflows_check;

alter table public.byoa_agent_policies
  add constraint byoa_agent_policies_allowed_workflows_check
  check (
    cardinality(allowed_workflows) between 1 and 5
    and allowed_workflows <@ array[
      'github_due_diligence',
      'sentiment_tone',
      'builder_update',
      'market_context',
      'custom_task'
    ]::text[]
  ) not valid;

alter table public.byoa_agent_policies
  validate constraint byoa_agent_policies_allowed_workflows_check;

alter table public.byoa_agent_credentials
  drop constraint if exists byoa_agent_credentials_scopes_check;

alter table public.byoa_agent_credentials
  add constraint byoa_agent_credentials_scopes_check
  check (
    cardinality(scopes) between 1 and 9
    and scopes <@ array[
      'quotes:create',
      'workflows:execute',
      'results:read',
      'manifest:read',
      'workflows:read',
      'runs:create',
      'runs:read',
      'reports:read',
      '*'
    ]::text[]
  ) not valid;

alter table public.byoa_agent_credentials
  validate constraint byoa_agent_credentials_scopes_check;
