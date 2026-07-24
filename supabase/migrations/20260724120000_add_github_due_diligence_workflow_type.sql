-- Allow the GitHub Project Due Diligence workflow in hosted checkout tables.

alter table public.hosted_workflow_quotes
  drop constraint if exists hosted_workflow_quotes_workflow_type_check;

alter table public.hosted_agent_jobs
  drop constraint if exists hosted_agent_jobs_workflow_type_check;

alter table public.hosted_workflow_quotes
  add constraint hosted_workflow_quotes_workflow_type_check
  check (
    workflow_type in (
      'github_due_diligence',
      'sentiment_tone',
      'builder_update',
      'market_context',
      'custom_task'
    )
  ) not valid;

alter table public.hosted_workflow_quotes
  validate constraint hosted_workflow_quotes_workflow_type_check;

alter table public.hosted_agent_jobs
  add constraint hosted_agent_jobs_workflow_type_check
  check (
    workflow_type in (
      'github_due_diligence',
      'sentiment_tone',
      'builder_update',
      'market_context',
      'custom_task'
    )
  ) not valid;

alter table public.hosted_agent_jobs
  validate constraint hosted_agent_jobs_workflow_type_check;
