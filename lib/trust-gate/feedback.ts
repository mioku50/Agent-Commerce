import { ingestErc8183JobOutcomeEvidence, ingestX402PaymentEvidence } from "../reputation/ingest.ts";

export async function feedbackFromErc8183Completion(
  params: {
    agentId: string;
    jobId: string;
    outcome: "completed" | "rejected";
    clientAddress: string;
    providerAddress: string;
    deliverableHash: string;
    completeTx: string;
    economicValueUsdc?: number;
  },
  dryRun: boolean = false
): Promise<void> {
  // Anti-gaming: skip if client == provider (self-rating)
  if (params.clientAddress.toLowerCase() === params.providerAddress.toLowerCase()) {
    if (dryRun) console.log("Skipping feedbackFromErc8183Completion due to self-rating");
    return;
  }

  const verdictPassed = params.outcome === "completed";
  
  if (dryRun) {
    console.log("Would ingestErc8183JobOutcomeEvidence:", {
      agentId: params.agentId,
      jobId: params.jobId,
      deliverableHash: params.deliverableHash,
      verdictPassed,
      economicValueUsdc: params.economicValueUsdc,
      clientAddress: params.clientAddress,
      arcProofTx: params.completeTx,
    });
    return;
  }

  await ingestErc8183JobOutcomeEvidence({
    agentId: params.agentId,
    jobId: params.jobId,
    deliverableHash: params.deliverableHash,
    verdictPassed,
    economicValueUsdc: params.economicValueUsdc,
    clientAddress: params.clientAddress,
    arcProofTx: params.completeTx,
  });
}

export async function feedbackFromX402Settlement(
  params: {
    agentId: string;
    paymentId: string;
    outcome: "settled" | "failed";
    payerAddress: string;
    payeeAddress: string;
    amountUsdc: number;
    serviceId?: string;
  },
  dryRun: boolean = false
): Promise<void> {
  // Anti-gaming: skip if payer == payee (self-rating)
  if (params.payerAddress.toLowerCase() === params.payeeAddress.toLowerCase()) {
    if (dryRun) console.log("Skipping feedbackFromX402Settlement due to self-rating");
    return;
  }

  const success = params.outcome === "settled";
  
  if (dryRun) {
    console.log("Would ingestX402PaymentEvidence:", {
      agentId: params.agentId,
      paymentId: params.paymentId,
      success,
      amountUsdc: params.amountUsdc,
      clientAddress: params.payerAddress,
    });
    return;
  }

  await ingestX402PaymentEvidence({
    agentId: params.agentId,
    paymentId: params.paymentId,
    success,
    amountUsdc: params.amountUsdc,
    clientAddress: params.payerAddress,
  });
}
