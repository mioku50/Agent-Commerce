/**
 * P2.1 production smoke for the reference external seller workflow.
 *
 * This script never logs credentials or private request data. It only performs
 * a sponsored run and therefore never signs or sends a buyer payment.
 */
import { randomUUID } from "node:crypto";
import type { Address } from "viem";
import {
  createAgentCredential,
  getByoaClient,
  revokeAgentCredential,
} from "../lib/byoa/service.ts";
import { MACHINE_API_SCOPES, type ByoaCredentialRow } from "../lib/byoa/types.ts";

const CONFIRMATION = "--confirm-production";
const REFERENCE_WORKFLOW = "seller_project_update_intelligence";
const RUN_TIMEOUT_MS = 180_000;
const PROOF_TIMEOUT_MS = 120_000;
const SMOKE_USER_AGENT = `agent-commerce-p21-production-smoke/${randomUUID()}`;

type CredentialHandle = {
  agentId: string;
  credentialId: string;
  ownerWallet: Address;
  token: string;
  temporary: boolean;
};

type JsonResponse = {
  status: number;
  body: Record<string, any>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function url(baseUrl: URL, path: string) {
  return new URL(path, baseUrl).toString();
}

async function requestJson(
  baseUrl: URL,
  path: string,
  token?: string,
  init: RequestInit = {},
): Promise<JsonResponse> {
  const response = await fetch(url(baseUrl, path), {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": SMOKE_USER_AGENT,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  return {
    status: response.status,
    body: await response.json().catch(() => ({})) as Record<string, any>,
  };
}

function hasMachineScopes(scopes: string[]) {
  return scopes.length === MACHINE_API_SCOPES.length &&
    MACHINE_API_SCOPES.every((scope) => scopes.includes(scope));
}

async function validateCredential(
  baseUrl: URL,
  token: string,
  label: string,
): Promise<CredentialHandle> {
  const authenticated = await requestJson(
    baseUrl,
    "/api/agent/v1/workflows",
    token,
  );
  assert(authenticated.status === 200, `${label} was rejected by the Production Machine API.`);

  const tokenMetadata = token.match(/^(aac_[a-f0-9]{8})\.(agt_[a-z0-9]{20})\./);
  assert(tokenMetadata, `${label} does not use the expected credential format.`);
  const client = getByoaClient();
  const agentResult = await client.from("byoa_agents")
    .select("id,public_id,owner_wallet,status,agent_wallet_status")
    .eq("public_id", tokenMetadata[2])
    .maybeSingle();
  assert(!agentResult.error && agentResult.data, `${label} is not linked to an agent.`);
  assert(agentResult.data.status === "active", `${label}'s agent is not active.`);
  assert(agentResult.data.agent_wallet_status === "verified", `${label}'s agent wallet is not verified.`);

  const credentialResult = await client.from("byoa_agent_credentials")
    .select("*")
    .eq("agent_id", agentResult.data.id)
    .eq("token_prefix", tokenMetadata[1])
    .maybeSingle();
  assert(!credentialResult.error && credentialResult.data, `${label} is not a known production credential.`);
  const credential = credentialResult.data as ByoaCredentialRow;
  assert(credential.credential_type === "machine_api", `${label} is not a Machine API credential.`);
  assert(!credential.revoked_at, `${label} is revoked.`);
  assert(Date.parse(credential.expires_at) > Date.now(), `${label} is expired.`);
  assert(hasMachineScopes(credential.scopes), `${label} does not have the exact Machine API scope set.`);

  return {
    agentId: credential.agent_id,
    credentialId: credential.id,
    ownerWallet: credential.owner_wallet as Address,
    token,
    temporary: false,
  };
}

async function issueCredential(agent: { id: string; ownerWallet: Address }, label: string) {
  const created = await createAgentCredential(agent.ownerWallet, agent.id, {
    credentialType: "machine_api",
    label,
    scopes: [...MACHINE_API_SCOPES],
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  });
  return {
    agentId: agent.id,
    credentialId: created.credential.id,
    ownerWallet: agent.ownerWallet,
    token: created.token,
    temporary: true,
  } satisfies CredentialHandle;
}

async function revokeTemporary(handle: CredentialHandle | null) {
  if (!handle?.temporary) return;
  await revokeAgentCredential(handle.ownerWallet, handle.agentId, handle.credentialId);
}

function workflowAllowed(values: unknown, workflowType: string) {
  return Array.isArray(values) && (
    values.includes("*") || values.includes("seller:*") || values.includes(workflowType)
  );
}

async function eligibleAgents(workflowType: string, priceUsdc: number, sellerOwnerWallet: Address) {
  const client = getByoaClient();
  const agentsResult = await client.from("byoa_agents")
    .select("id,owner_wallet,status,agent_wallet_status")
    .eq("status", "active")
    .eq("agent_wallet_status", "verified");
  assert(!agentsResult.error, "Unable to load eligible production agents.");
  const ids = (agentsResult.data ?? []).map((agent) => agent.id as string);
  if (ids.length === 0) return [];
  const policiesResult = await client.from("byoa_agent_policies")
    .select("agent_id,status,allowed_workflows,allowed_service_types,max_price_per_run_usdc")
    .in("agent_id", ids)
    .eq("status", "active");
  assert(!policiesResult.error, "Unable to load eligible production policies.");
  const eligibleIds = new Set((policiesResult.data ?? [])
    .filter((policy) =>
      workflowAllowed(policy.allowed_workflows, workflowType) &&
      Array.isArray(policy.allowed_service_types) &&
      policy.allowed_service_types.includes("external_seller") &&
      Number(policy.max_price_per_run_usdc) >= priceUsdc
    )
    .map((policy) => policy.agent_id as string));
  return (agentsResult.data ?? [])
    .filter((agent) =>
      eligibleIds.has(agent.id as string) &&
      String(agent.owner_wallet).toLowerCase() !== sellerOwnerWallet.toLowerCase()
    )
    .map((agent) => ({ id: agent.id as string, ownerWallet: agent.owner_wallet as Address }));
}

async function sellerLedgerForJob(jobId: string) {
  const result = await getByoaClient().from("seller_revenue_ledger")
    .select("id,seller_id,service_id,service_version,quote_id,job_id,receipt_id,gross_amount_usdc,platform_fee_usdc,seller_net_amount_usdc,settlement_status")
    .eq("job_id", jobId);
  assert(!result.error, "Unable to verify the seller revenue ledger.");
  return result.data ?? [];
}

async function userPaymentsForJob(jobId: string) {
  const result = await getByoaClient().from("hosted_workflow_user_payments")
    .select("id,quote_id,job_id,payment_mode,status")
    .eq("job_id", jobId);
  assert(!result.error, "Unable to verify buyer payment idempotency.");
  return result.data ?? [];
}

async function referenceSellerIdentity(publicServiceId: string) {
  const client = getByoaClient();
  const service = await client.from("store_services")
    .select("id,seller_id,source_type,status")
    .eq("public_id", publicServiceId)
    .eq("source_type", "external_seller")
    .maybeSingle();
  assert(!service.error && service.data?.seller_id, "The reference workflow is not linked to a seller account.");
  const seller = await client.from("seller_accounts")
    .select("id,owner_wallet,status")
    .eq("id", service.data.seller_id)
    .maybeSingle();
  assert(!seller.error && seller.data?.status === "active", "The reference seller account is unavailable.");
  return { serviceId: service.data.id as string, sellerId: seller.data.id as string, ownerWallet: seller.data.owner_wallet as Address };
}

async function run(baseUrl: URL) {
  let credentialA: CredentialHandle | null = null;
  let credentialB: CredentialHandle | null = null;
  const providedA = process.env.SELLER_SMOKE_TOKEN_A?.trim() || "";
  const providedB = process.env.SELLER_SMOKE_TOKEN_B?.trim() || "";
  assert(Boolean(providedA) === Boolean(providedB), "Provide both SELLER_SMOKE_TOKEN_A and SELLER_SMOKE_TOKEN_B, or neither.");

  const manifest = await requestJson(baseUrl, "/api/byoa/manifest");
  assert(manifest.status === 200, "The public BYOA manifest is unavailable.");
  const manifestWorkflow = Array.isArray(manifest.body.sellerWorkflows)
    ? manifest.body.sellerWorkflows.find((item: Record<string, unknown>) => item.workflowType === REFERENCE_WORKFLOW)
    : null;
  assert(manifestWorkflow, "The reference seller workflow is missing from the public manifest.");
  assert(typeof manifestWorkflow.serviceId === "string", "The reference manifest has no public service ID.");
  assert(Number.isInteger(manifestWorkflow.serviceVersion), "The reference manifest has no immutable service version.");
  assert(manifestWorkflow.providerType === "external_seller", "The reference manifest provider type is invalid.");
  const serviceId = manifestWorkflow.serviceId as string;
  const serviceVersion = manifestWorkflow.serviceVersion as number;
  const priceUsdc = Number(manifestWorkflow.priceUsdc);
  assert(Number.isFinite(priceUsdc) && priceUsdc > 0, "The reference seller price is invalid.");
  const referenceSeller = await referenceSellerIdentity(serviceId);
  console.log(`[p21-production-smoke] manifest=ok service=${serviceId} version=${serviceVersion}`);

  const payload = {
    projectName: "Agent Commerce P2.1 production smoke",
    updateText: "Shipped the external seller marketplace pipeline. Next milestone is validating one isolated, idempotent, receipt-backed Arc Testnet execution.",
  };
  const quoteKey = `p21-quote-${randomUUID()}`;
  const quoteRequest = {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": quoteKey },
    body: JSON.stringify({ workflow: REFERENCE_WORKFLOW, input: payload }),
  } satisfies RequestInit;

  try {
    let quote: JsonResponse | null = null;
    if (providedA && providedB) {
      [credentialA, credentialB] = await Promise.all([
        validateCredential(baseUrl, providedA, "Credential A"),
        validateCredential(baseUrl, providedB, "Credential B"),
      ]);
      assert(credentialA.agentId !== credentialB.agentId, "Credentials A and B must belong to different agents.");
      quote = await requestJson(baseUrl, "/api/agent/v1/quotes", credentialA.token, quoteRequest);
      console.log("[p21-production-smoke] using caller-provided credentials; tokens will not be logged or revoked");
    } else {
      const eligible = await eligibleAgents(REFERENCE_WORKFLOW, priceUsdc, referenceSeller.ownerWallet);
      assert(eligible.length >= 2, "At least two active verified agents must allow the reference seller workflow and external_seller service type.");
      for (const candidate of eligible) {
        const issued = await issueCredential(candidate, `P2.1 smoke A ${randomUUID().slice(0, 8)}`);
        const candidateQuote = await requestJson(baseUrl, "/api/agent/v1/quotes", issued.token, quoteRequest);
        if ((candidateQuote.status === 200 || candidateQuote.status === 201) && candidateQuote.body.sponsored === true) {
          credentialA = issued;
          quote = candidateQuote;
          const isolationAgent = eligible.find((agent) => agent.id !== candidate.id);
          assert(isolationAgent, "A second eligible agent is required for tenant isolation.");
          credentialB = await issueCredential(isolationAgent, `P2.1 smoke B ${randomUUID().slice(0, 8)}`);
          break;
        }
        await revokeTemporary(issued);
      }
    }

    assert(credentialA && credentialB && quote, "No eligible agent could create a sponsored reference seller quote.");
    assert(credentialA.ownerWallet.toLowerCase() !== referenceSeller.ownerWallet.toLowerCase(), "Seller A and Buyer Agent B must have different owner wallets.");
    assert(quote.status === 200 || quote.status === 201, `Seller quote failed with HTTP ${quote.status}.`);
    assert(quote.body.sponsored === true, "P2.1 smoke refuses paid execution; enable explicit server-sponsored seller mode and quota.");
    assert(quote.body.serviceId === serviceId && quote.body.serviceVersion === serviceVersion, "Quote did not freeze the discovered service version.");
    assert(typeof quote.body.quoteId === "string", "Seller quote returned no quote ID.");
    const quoteId = quote.body.quoteId as string;

    const quoteReplay = await requestJson(baseUrl, "/api/agent/v1/quotes", credentialA.token, quoteRequest);
    assert((quoteReplay.status === 200 || quoteReplay.status === 201) && quoteReplay.body.quoteId === quoteId, "Quote idempotency replay did not return the original quote.");
    console.log("[p21-production-smoke] immutable sponsored quote=ok replay=same quote");

    const machineWorkflows = await requestJson(baseUrl, "/api/agent/v1/workflows", credentialA.token);
    assert(machineWorkflows.status === 200, "Credential A could not list Machine API workflows.");
    const discovered = Array.isArray(machineWorkflows.body.workflows)
      ? machineWorkflows.body.workflows.find((item: Record<string, unknown>) => item.workflowType === REFERENCE_WORKFLOW)
      : null;
    assert(discovered?.serviceId === serviceId && discovered?.serviceVersion === serviceVersion, "Machine API discovery does not match the public manifest.");

    const runRequest = {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": `p21-run-${randomUUID()}` },
      body: JSON.stringify({ quoteId, input: payload }),
    } satisfies RequestInit;
    const launched = await requestJson(baseUrl, "/api/agent/v1/runs", credentialA.token, runRequest);
    assert(launched.status === 200 || launched.status === 201, `Seller run launch failed with HTTP ${launched.status}.`);
    assert(typeof launched.body.runId === "string", "Seller run launch returned no run ID.");
    const runId = launched.body.runId as string;
    const runReplay = await requestJson(baseUrl, "/api/agent/v1/runs", credentialA.token, runRequest);
    assert((runReplay.status === 200 || runReplay.status === 201) && runReplay.body.runId === runId, "Run idempotency replay did not return the original run.");
    console.log("[p21-production-smoke] run launch=ok replay=same run");

    const [foreignRun, foreignReport] = await Promise.all([
      requestJson(baseUrl, `/api/agent/v1/runs/${encodeURIComponent(runId)}`, credentialB.token),
      requestJson(baseUrl, `/api/agent/v1/reports/${encodeURIComponent(runId)}`, credentialB.token),
    ]);
    assert(foreignRun.status === 404 && foreignRun.body.error?.code === "run_not_found", "Credential B was not isolated from Credential A's run.");
    assert(foreignReport.status === 404 && foreignReport.body.error?.code === "report_not_found", "Credential B was not isolated from Credential A's report.");
    console.log("[p21-production-smoke] cross-agent run/report isolation=404");

    const runDeadline = Date.now() + RUN_TIMEOUT_MS;
    let runStatus = "";
    while (Date.now() < runDeadline) {
      const status = await requestJson(baseUrl, `/api/agent/v1/runs/${encodeURIComponent(runId)}`, credentialA.token);
      assert(status.status === 200, "Credential A could not read its seller run.");
      runStatus = String(status.body.status ?? "");
      if (["completed", "completed_with_warnings", "failed"].includes(runStatus)) break;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    assert(runStatus === "completed" || runStatus === "completed_with_warnings", `Seller run did not complete successfully (status=${runStatus || "timeout"}).`);

    const proofDeadline = Date.now() + PROOF_TIMEOUT_MS;
    let report: JsonResponse | null = null;
    while (Date.now() < proofDeadline) {
      report = await requestJson(baseUrl, `/api/agent/v1/reports/${encodeURIComponent(runId)}`, credentialA.token);
      if (report.status === 200 && Array.isArray(report.body.arcProofs) && report.body.arcProofs.some((proof: Record<string, unknown>) => proof.status === "verified" && typeof proof.transactionHash === "string")) break;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    assert(report?.status === 200, "Credential A could not read the completed seller report.");
    assert(report.body.providerType === "external_seller", "Seller report provider type is invalid.");
    assert(report.body.service?.serviceId === serviceId && report.body.service?.serviceVersion === serviceVersion, "Seller report does not reference the immutable service version.");
    assert(report.body.result && typeof report.body.result.summary === "string", "Seller report has no structured result.");
    assert(Array.isArray(report.body.receipts) && report.body.receipts.length > 0, "Seller report has no receipt.");
    assert(Array.isArray(report.body.arcProofs) && report.body.arcProofs.some((proof: Record<string, unknown>) => proof.status === "verified" && typeof proof.transactionHash === "string"), "Seller report has no verified Arc proof.");

    const [ledger, payments] = await Promise.all([
      sellerLedgerForJob(runId),
      userPaymentsForJob(runId),
    ]);
    assert(ledger.length === 1, `Expected exactly one seller revenue entry, found ${ledger.length}.`);
    assert(ledger[0].service_version === serviceVersion && ledger[0].receipt_id, "Seller revenue is not linked to the immutable version and receipt.");
    assert(["earned", "settlement_pending", "settled"].includes(ledger[0].settlement_status), "Seller revenue did not reach an earned state.");
    assert(
      Math.abs(Number(ledger[0].gross_amount_usdc) - Number(ledger[0].platform_fee_usdc) - Number(ledger[0].seller_net_amount_usdc)) < 0.0000001,
      "Seller gross, platform fee, and net revenue do not reconcile.",
    );
    assert(payments.length === 1, `Expected exactly one buyer payment record, found ${payments.length}.`);

    const finalReplay = await requestJson(baseUrl, "/api/agent/v1/runs", credentialA.token, runRequest);
    assert((finalReplay.status === 200 || finalReplay.status === 201) && finalReplay.body.runId === runId, "Completed run replay did not return the original run.");
    const [ledgerAfterReplay, paymentsAfterReplay] = await Promise.all([
      sellerLedgerForJob(runId),
      userPaymentsForJob(runId),
    ]);
    assert(ledgerAfterReplay.length === 1, "Idempotent replay created duplicate seller revenue.");
    assert(paymentsAfterReplay.length === 1, "Idempotent replay created a duplicate buyer payment.");
    console.log(`[p21-production-smoke] completed report=ok receipt=ok Arc proof=verified ledger=${ledger[0].settlement_status}`);
    console.log("[p21-production-smoke] PASSED: one run, one payment record, one seller revenue entry");
  } finally {
    const cleanup = await Promise.allSettled([
      revokeTemporary(credentialB),
      revokeTemporary(credentialA),
    ]);
    assert(cleanup.every((result) => result.status === "fulfilled"), "Temporary smoke credentials could not be fully revoked.");
    if (credentialA?.temporary || credentialB?.temporary) {
      console.log("[p21-production-smoke] temporary credentials revoked");
    }
  }
}

assert(process.argv[2] === CONFIRMATION, `Pass ${CONFIRMATION} to authorize the production smoke.`);
assert(process.argv[3], "Pass the production HTTPS base URL.");
const baseUrl = new URL(process.argv[3]);
assert(baseUrl.protocol === "https:", "Production smoke requires an HTTPS base URL.");

run(baseUrl).catch((error) => {
  console.error(`[p21-production-smoke] FAILED: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exitCode = 1;
});
