import { BatchEvmScheme } from "@circle-fin/x402-batching/client";
import { getAddress, type Address, type Hex } from "viem";

export type ExecuteByoaWorkflowResult = {
  jobId: string;
  aggregatePaymentId: string;
  created: boolean;
  idempotent: boolean;
  creditIssued: boolean;
  statusUrl: string;
};

export async function signAndSendByoaX402Payment(input: {
  resourceUrl: string;
  priceUsdc: string;
  amountAtomic: string;
  payTo: string;
  credential: string;
  idempotencyKey: string;
  requestBody: Record<string, unknown>;
  wallet: {
    address: string | null;
    signTypedData: (params: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    }) => Promise<Hex>;
  };
}): Promise<ExecuteByoaWorkflowResult> {
  if (!input.wallet.address) {
    throw new Error("Connect the registered external agent wallet before signing.");
  }

  const requirements = {
    scheme: "exact",
    network: "eip155:5042002",
    asset: "0x3600000000000000000000000000000000000000",
    amount: input.amountAtomic,
    payTo: getAddress(input.payTo),
    maxTimeoutSeconds: 604900,
    extra: {
      name: "GatewayWalletBatched" as const,
      version: "1" as const,
      verifyingContract: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" as Address,
    },
  };

  const signer = {
    address: getAddress(input.wallet.address),
    signTypedData: async (params: {
      domain: { name: string; version: string; chainId: number; verifyingContract: Address };
      types: Record<string, Array<{ name: string; type: string }>>;
      primaryType: string;
      message: Record<string, unknown>;
    }) => {
      return await input.wallet.signTypedData({
        domain: params.domain,
        types: params.types,
        primaryType: params.primaryType,
        message: params.message,
      });
    },
  };

  const scheme = new BatchEvmScheme(signer);
  const payload = await scheme.createPaymentPayload(2, requirements);

  const payloadString = JSON.stringify(payload);
  const paymentSignature = typeof window !== "undefined"
    ? btoa(payloadString)
    : Buffer.from(payloadString).toString("base64");

  const response = await fetch(input.resourceUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.credential}`,
      "Idempotency-Key": input.idempotencyKey,
      "PAYMENT-SIGNATURE": paymentSignature,
    },
    body: JSON.stringify(input.requestBody),
  });

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const errorMsg = typeof body.error === "string" ? body.error : `Payment execute failed (${response.status})`;
    const reason = typeof body.reason === "string" ? ` (${body.reason})` : "";
    throw new Error(`${errorMsg}${reason}`);
  }

  return body as ExecuteByoaWorkflowResult;
}
