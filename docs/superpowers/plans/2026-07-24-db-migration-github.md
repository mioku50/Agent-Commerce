# Database Migration & Server Logging Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create and apply Supabase migration `20260724120000_add_github_due_diligence_workflow_type.sql` to update `hosted_workflow_quotes` and `hosted_agent_jobs` check constraints to allow `github_due_diligence`, add database regression tests in `scripts/hosted-checkout-db-tests.mts`, and improve server-side logging for quote insertions so Supabase DB errors are never silently swallowed.

**Architecture:**
1. **Supabase Migration (`supabase/migrations/20260724120000_add_github_due_diligence_workflow_type.sql`):** Drop existing `workflow_type` check constraints on `hosted_workflow_quotes` and `hosted_agent_jobs` and re-add them including `'github_due_diligence'`.
2. **Apply Migration (`npm run db:migrate`):** Execute migration against the production Supabase database using `AGENT_DB_POSTGRES_URL_NON_POOLING`.
3. **Database Regression Testing (`scripts/hosted-checkout-db-tests.mts`):** Add a test inserting a quote and job record with `workflow_type: "github_due_diligence"` and verifying clean insertion.
4. **Server Error Logging (`lib/agent/hosted-workflows.ts` & `app/api/hosted-agent/quotes/route.ts`):** Log detailed DB error attributes (`code`, `message`, `details`, `hint`, `workflowType`) on the server before throwing generic errors.

---

### Task 1: Create Supabase Migration File

**Files:**
- Create: `supabase/migrations/20260724120000_add_github_due_diligence_workflow_type.sql`

- [ ] **Step 1: Create migration file**

```sql
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
```

- [ ] **Step 2: Commit Task 1**

```bash
git add supabase/migrations/20260724120000_add_github_due_diligence_workflow_type.sql
git commit -m "feat(db): add migration for github_due_diligence workflow type check constraints"
```

---

### Task 2: Apply Migration & Server Error Logging

**Files:**
- Modify: `lib/agent/hosted-workflows.ts`
- Modify: `app/api/hosted-agent/quotes/route.ts`

- [ ] **Step 1: Run `npm run db:migrate`**

Apply migration using environment connection string.

- [ ] **Step 2: Enhance server-side error logging in `lib/agent/hosted-workflows.ts`**

When `saveHostedWorkflowQuote` or DB insertion encounters `inserted.error`:
```typescript
if (inserted.error) {
  console.error("[hosted-checkout] quote insert failed", {
    code: inserted.error.code,
    message: inserted.error.message,
    details: inserted.error.details,
    hint: inserted.error.hint,
    workflowType: input.request.workflowType,
  });
}
```

- [ ] **Step 3: Commit Task 2**

```bash
git add lib/agent/hosted-workflows.ts app/api/hosted-agent/quotes/route.ts
git commit -m "fix(logging): log detailed DB error details on quote insertion failure"
```

---

### Task 3: GitHub Database Regression Test

**Files:**
- Modify: `scripts/hosted-checkout-db-tests.mts`

- [ ] **Step 1: Add `github_due_diligence` test case to `scripts/hosted-checkout-db-tests.mts`**

Add quote insertion test for `workflow_type: "github_due_diligence"` with repository metadata, and assert `!error && data`.

- [ ] **Step 2: Run `npm run hosted:checkout-db-test`**

Verify both `sentiment_tone` and `github_due_diligence` quotes insert cleanly into Supabase.

- [ ] **Step 3: Run full verification suite**

Run `npm run build && npm run review:smoke`.

- [ ] **Step 4: Commit Task 3**

```bash
git add scripts/hosted-checkout-db-tests.mts
git commit -m "test(db): add github_due_diligence database quote insertion regression test"
```
