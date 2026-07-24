-- Allow the GitHub Project Due Diligence workflow in hosted checkout tables.

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select
      conrelid::regclass as table_name,
      conname
    from pg_constraint
    where contype = 'c'
      and conrelid in (
        'public.hosted_workflow_quotes'::regclass,
        'public.hosted_agent_jobs'::regclass
      )
      and pg_get_constraintdef(oid) ilike '%workflow_type%'
  loop
    execute format(
      'alter table %s drop constraint %I',
      constraint_row.table_name,
      constraint_row.conname
    );
  end loop;
end
$$;

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
  );

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
  );
