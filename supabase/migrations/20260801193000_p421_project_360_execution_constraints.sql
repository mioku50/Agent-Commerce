-- P4.2.1: align legacy hosted-workflow execution shape constraints with the
-- approved Project 360 orchestrator (up to seven allowlisted paid steps).

begin;

alter table public.hosted_workflow_quotes
  drop constraint if exists hosted_workflow_quotes_selected_services_check;
alter table public.hosted_workflow_quotes
  add constraint hosted_workflow_quotes_selected_services_check
  check (
    jsonb_typeof(selected_services) = 'array'
    and jsonb_array_length(selected_services) between 1 and 7
  ) not valid;
alter table public.hosted_workflow_quotes
  validate constraint hosted_workflow_quotes_selected_services_check;

alter table public.hosted_agent_jobs
  drop constraint if exists hosted_agent_jobs_selected_services_check;
alter table public.hosted_agent_jobs
  add constraint hosted_agent_jobs_selected_services_check
  check (
    jsonb_typeof(selected_services) = 'array'
    and jsonb_array_length(selected_services) between 1 and 7
  ) not valid;
alter table public.hosted_agent_jobs
  validate constraint hosted_agent_jobs_selected_services_check;

alter table public.hosted_agent_jobs
  drop constraint if exists hosted_agent_jobs_spent_usdc_check;
alter table public.hosted_agent_jobs
  add constraint hosted_agent_jobs_spent_usdc_check
  check (spent_usdc between 0 and 0.010) not valid;
alter table public.hosted_agent_jobs
  validate constraint hosted_agent_jobs_spent_usdc_check;

commit;
