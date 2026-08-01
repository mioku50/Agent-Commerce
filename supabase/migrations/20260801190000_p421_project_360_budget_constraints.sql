-- P4.2.1: align the persisted workflow quote/job budget ceiling with the
-- already-approved Project 360 checkout ceiling. Prices remain immutable and
-- the checkout runtime still enforces HOSTED_WORKFLOW_MAX_PRICE_USDC.

begin;

alter table public.hosted_workflow_quotes
  drop constraint if exists hosted_workflow_quotes_budget_usdc_check;
alter table public.hosted_workflow_quotes
  add constraint hosted_workflow_quotes_budget_usdc_check
  check (budget_usdc between 0.001 and 0.010) not valid;
alter table public.hosted_workflow_quotes
  validate constraint hosted_workflow_quotes_budget_usdc_check;

alter table public.hosted_agent_jobs
  drop constraint if exists hosted_agent_jobs_budget_usdc_check;
alter table public.hosted_agent_jobs
  add constraint hosted_agent_jobs_budget_usdc_check
  check (budget_usdc between 0.001 and 0.010) not valid;
alter table public.hosted_agent_jobs
  validate constraint hosted_agent_jobs_budget_usdc_check;

commit;
