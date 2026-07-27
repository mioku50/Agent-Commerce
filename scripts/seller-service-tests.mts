import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  canonicalSellerInput,
  hashSellerInput,
  isSellerWorkflowType,
  safeSellerResult,
  sellerWorkflowType,
  validateSellerWorkflowInput,
} from "../lib/seller/marketplace.ts";
import { validateJsonSchemaValue, validateSupportedJsonSchema } from "../lib/seller/json-schema.ts";

const schema = {
  type: "object",
  properties: {
    projectName: { type: "string", minLength: 2 },
    updateText: { type: "string", minLength: 20 },
  },
  required: ["projectName", "updateText"],
  additionalProperties: false,
};
assert.equal(validateSupportedJsonSchema(schema).ok, true);
assert.equal(validateSupportedJsonSchema({ type: "string", oneOf: [] }).ok, false);
assert.equal(validateJsonSchemaValue({ projectName: "Arc", updateText: "A sufficiently long project update." }, schema).ok, true);
assert.equal(validateJsonSchemaValue({ projectName: "Arc", updateText: "short", secret: "never" }, schema).ok, false);
assert.equal(canonicalSellerInput({ b: 2, a: 1 }), '{"a":1,"b":2}');
assert.equal(hashSellerInput({ b: 2, a: 1 }), hashSellerInput({ a: 1, b: 2 }));
assert.equal(sellerWorkflowType("project-update-intelligence"), "seller_project_update_intelligence");
assert.equal(isSellerWorkflowType("seller_project_update_intelligence"), true);
assert.deepEqual(safeSellerResult({ result: "ok", authorization: "secret", endpoint: "hidden" }), { result: "ok" });
assert.throws(
  () => validateSellerWorkflowInput({ projectName: "Arc", updateText: "A sufficiently long update.", apiToken: "hidden" }, {
    type: "object",
    properties: {
      projectName: { type: "string" },
      updateText: { type: "string" },
      apiToken: { type: "string" },
    },
    required: ["projectName", "updateText", "apiToken"],
  }),
  /sensitive fields are not accepted/,
);

const migration = await readFile(new URL("../supabase/migrations/20260727160000_p21_external_seller_marketplace.sql", import.meta.url), "utf8");
for (const required of ["seller_accounts", "seller_service_versions", "seller_revenue_ledger", "seller_service_version", "seller_net_amount_usdc", "create_seller_service_v1", "update_seller_service_v1", "finalize_seller_workflow_success_v1"]) {
  assert.match(migration, new RegExp(required));
}
assert.match(migration, /revoke all on table public\.seller_service_versions from anon, authenticated/);
const referenceRoute = await readFile(new URL("../app/api/reference-seller/project-update-intelligence/route.ts", import.meta.url), "utf8");
assert.match(referenceRoute, /REFERENCE_SELLER_WALLET/);
assert.match(referenceRoute, /withGateway\([\s\S]*REFERENCE_SELLER_WALLET/);
console.log("seller service tests passed");
