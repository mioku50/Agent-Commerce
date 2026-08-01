-- P4.2.1: the original hosted job constraint predates Project 360 and still
-- caps execution at three services. Keep its stable name while aligning it
-- with the approved seven-step orchestrator ceiling.

begin;

alter table public.hosted_agent_jobs
  drop constraint if exists hosted_agent_jobs_selected_services_array_check;
alter table public.hosted_agent_jobs
  add constraint hosted_agent_jobs_selected_services_array_check
  check (
    jsonb_typeof(selected_services) = 'array'
    and jsonb_array_length(selected_services) <= 7
  ) not valid;
alter table public.hosted_agent_jobs
  validate constraint hosted_agent_jobs_selected_services_array_check;

commit;
