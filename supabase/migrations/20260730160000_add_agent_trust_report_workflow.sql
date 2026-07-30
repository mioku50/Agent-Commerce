-- Add the Veyra Agent Trust Report to hosted checkout and Machine API policy.
-- External seller workflow support from P2.1 remains unchanged.

alter table public.hosted_workflow_quotes
  drop constraint if exists hosted_workflow_quotes_workflow_type_check;
alter table public.hosted_workflow_quotes
  add constraint hosted_workflow_quotes_workflow_type_check
  check (
    workflow_type in (
      'github_due_diligence', 'agent_trust_report', 'sentiment_tone',
      'builder_update', 'market_context', 'custom_task'
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
      'github_due_diligence', 'agent_trust_report', 'sentiment_tone',
      'builder_update', 'market_context', 'custom_task'
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
    cardinality(allowed_workflows) between 1 and 12
    and array_to_string(allowed_workflows, ',') ~
      '^((\*|github_due_diligence|agent_trust_report|sentiment_tone|builder_update|market_context|custom_task|seller:\*|seller_[a-z0-9_]{3,80})(,(\*|github_due_diligence|agent_trust_report|sentiment_tone|builder_update|market_context|custom_task|seller:\*|seller_[a-z0-9_]{3,80}))*)$'
  ) not valid;
alter table public.byoa_agent_policies
  validate constraint byoa_agent_policies_allowed_workflows_check;
