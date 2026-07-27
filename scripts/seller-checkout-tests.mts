import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sellerWorkflowAllowed } from "../lib/seller/workflow.ts";

assert.equal(sellerWorkflowAllowed(["seller:*"], "seller_project_update_intelligence"), true);
assert.equal(sellerWorkflowAllowed(["seller_project_update_intelligence"], "seller_project_update_intelligence"), true);
assert.equal(sellerWorkflowAllowed(["github_due_diligence"], "seller_project_update_intelligence"), false);

const executeRoute = await readFile(new URL("../app/api/seller-workflows/execute/[serviceId]/versions/[version]/route.ts", import.meta.url), "utf8");
const workflow = await readFile(new URL("../lib/seller/workflow.ts", import.meta.url), "utf8");
const proxy = await readFile(new URL("../lib/seller/proxy.ts", import.meta.url), "utf8");
assert.ok(executeRoute.indexOf("quote.status") < executeRoute.indexOf("await executeExternalSellerProxy"), "checkout state must be checked before seller execution");
assert.match(executeRoute, /validateSellerWorkflowOutput/);
assert.match(proxy, /unsupported content type/);
assert.match(proxy, /invalid JSON/);
assert.match(workflow, /finalizeSellerSuccess/);
assert.match(workflow, /finalize_seller_workflow_success_v1/);
assert.match(workflow, /finalizeHostedWorkflowUserPayment/);
const jobRunner = workflow.slice(workflow.indexOf("export async function runSellerAgentJob"));
assert.ok(
  jobRunner.indexOf("await claimSellerJob") < jobRunner.indexOf('service.status !== "active"'),
  "A paid seller job must be claimed before version/status validation so failures enter credit reconciliation",
);
assert.match(workflow, /structured_result: null/);
console.log("seller checkout tests passed");
