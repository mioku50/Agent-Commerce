import { getHostedAgentJobView } from "../agent/hosted-jobs.ts";
import { ByoaError, getByoaClient, type AuthenticatedByoaAgent } from "./service.ts";

export async function getByoaResult(auth: AuthenticatedByoaAgent, jobId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new ByoaError("Job ID is invalid.", "invalid_id");
  const client = getByoaClient();
  const ownership = await client
    .from("hosted_agent_jobs")
    .select("id,byoa_agent_id")
    .eq("id", jobId)
    .eq("byoa_agent_id", auth.agent.id)
    .maybeSingle();
  if (ownership.error) throw new ByoaError("Unable to verify BYOA result ownership.", "database_unavailable", 503);
  if (!ownership.data) throw new ByoaError("BYOA result was not found.", "not_found", 404);

  const [view, payment] = await Promise.all([
    getHostedAgentJobView(jobId),
    client
      .from("byoa_workflow_payments")
      .select("id,quote_id,job_id,payment_event_id,payer_wallet,amount_usdc,gateway_transaction,status,downstream_spent_usdc,receipt_count,verified_proof_count,failure_reason,settled_at,completed_at")
      .eq("job_id", jobId)
      .eq("agent_id", auth.agent.id)
      .maybeSingle(),
  ]);
  if (!view) throw new ByoaError("BYOA result was not found.", "not_found", 404);
  if (payment.error) throw new ByoaError("Unable to load aggregate workflow payment.", "database_unavailable", 503);

  return {
    agentPublicId: auth.agent.public_id,
    job: view.job,
    finalReport: view.job.structuredResult,
    aggregateWorkflowPayment: payment.data ?? null,
    downstreamPayerWallet: view.payerWallet,
    services: view.services,
    internalReceiptIds: view.receiptIds,
    proofs: view.proofs,
    links: {
      agentRun: view.job.agentRunId ? `/runs/${view.job.agentRunId}` : null,
      aggregateReceipt: `/api/byoa/v1/results/${jobId}`,
      internalReceipts: view.receiptIds.map((id) => `/receipts/${id}`),
      passport: `/agents/byoa/${auth.agent.public_id}`,
      proofTransactions: view.proofs
        .map((proof) => proof.transactionUrl)
        .filter((value): value is string => Boolean(value)),
    },
  };
}
