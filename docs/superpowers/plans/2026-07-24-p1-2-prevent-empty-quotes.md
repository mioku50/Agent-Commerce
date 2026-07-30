# P1.2 — Prevent Empty Flagship Quotes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure hosted workflow quotes are rejected with HTTP 503 when services are disabled or when `github_due_diligence` lacks its required two services (`github-repository-intelligence` and `github-due-diligence-analysis`).

**Architecture:**
1. **Quote Endpoint Validation (`app/api/hosted-agent/quotes/route.ts`):** Check `plan.selectedServices.length === 0` and return HTTP 503 `workflow_services_unavailable`. For `github_due_diligence`, verify both `REQUIRED_GITHUB_SERVICES` are present in `selectedServices` and return HTTP 503 `github_workflow_incomplete` if missing.
2. **Error Humanizer (`lib/errors/humanize-error.ts`):** Map `workflow_services_unavailable` and `github_workflow_incomplete` to clear, actionable consumer messages.
3. **Regression Tests (`scripts/github-workflow-tests.mts`):** Test quote creation when `HOSTED_AGENT_ALLOWED_SERVICE_SLUGS` excludes GitHub services, asserting HTTP 503 and `reason: "github_workflow_incomplete"`.

---

### Task 1: Update Hosted Quotes API Endpoint

**Files:**
- Modify: `app/api/hosted-agent/quotes/route.ts`
- Modify: `lib/errors/humanize-error.ts`

- [ ] **Step 1: Update `app/api/hosted-agent/quotes/route.ts`**

Right after `const plan = await previewHostedWorkflow(workflowRequest);`:
```typescript
if (plan.selectedServices.length === 0) {
  console.error("[hosted-checkout] workflow has no available services", {
    workflowType: workflowRequest.workflowType,
    allowedServices: getHostedRunnerConfig()
      .serviceAllowlist
      .map((service) => service.slug),
    skippedServices: plan.skippedServices.map((service) => service.slug),
  });

  return NextResponse.json(
    {
      error:
        "This report is temporarily unavailable because its required services are not enabled.",
      reason: "workflow_services_unavailable",
    },
    { status: 503 },
  );
}

const REQUIRED_GITHUB_SERVICES = [
  "github-repository-intelligence",
  "github-due-diligence-analysis",
] as const;

if (workflowRequest.workflowType === "github_due_diligence") {
  const selected = new Set(
    plan.selectedServices.map((service) => service.slug),
  );

  const missing = REQUIRED_GITHUB_SERVICES.filter(
    (slug) => !selected.has(slug),
  );

  if (missing.length > 0) {
    console.error("[hosted-checkout] github workflow configuration incomplete", {
      missing,
      selected: [...selected],
    });

    return NextResponse.json(
      {
        error:
          "GitHub Project Due Diligence is temporarily unavailable because one or more required analysis services are disabled.",
        reason: "github_workflow_incomplete",
      },
      { status: 503 },
    );
  }
}
```

- [ ] **Step 2: Add error humanizer mappings in `lib/errors/humanize-error.ts`**

- `workflow_services_unavailable` -> Title: `Services unavailable`, Message: `This report is temporarily unavailable because its required services are not enabled.`
- `github_workflow_incomplete` -> Title: `Services disabled`, Message: `GitHub Project Due Diligence is temporarily unavailable because required analysis services are disabled.`

- [ ] **Step 3: Commit Task 1**

```bash
git add app/api/hosted-agent/quotes/route.ts lib/errors/humanize-error.ts
git commit -m "fix(quotes): reject empty or incomplete workflow quotes with HTTP 503"
```

---

### Task 2: Regression Test Suite Execution

**Files:**
- Modify: `scripts/github-workflow-tests.mts`

- [ ] **Step 1: Add regression test in `scripts/github-workflow-tests.mts`**

Add unit test simulating `HOSTED_AGENT_ALLOWED_SERVICE_SLUGS=premium-quote,text-analyzer,pyth-market-price` and verifying:
- `/api/hosted-agent/quotes` returns status 503
- response contains `reason: "github_workflow_incomplete"`
- no quote is saved

- [ ] **Step 2: Run all workflow & UI tests**

Run:
```bash
npm run github:workflow-test
npm run hosted:workflow-test
npm run frontend:ux-test
npm run build
```

- [ ] **Step 3: Commit Task 2**

```bash
git add scripts/github-workflow-tests.mts
git commit -m "test(github): add regression test for disabled service empty quote rejection"
```
