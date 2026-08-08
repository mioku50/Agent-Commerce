import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { signTrustClearance } from "../lib/trust-gate/sign.ts";
import { verifyTrustClearanceOnchain } from "../lib/trust-gate/verify.ts";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: {
    default: { http: [process.env.ARC_TESTNET_RPC_URL!] },
  },
};

const trustGateAddress = process.env.VEYRA_TRUST_GATE_ADDRESS as Hex;
const attesterPk = process.env.VEYRA_TRUST_ATTESTER_PRIVATE_KEY as Hex || process.env.CANARY_DEPLOYER_PRIVATE_KEY as Hex;

if (!trustGateAddress || !attesterPk) {
  throw new Error("Missing VEYRA_TRUST_GATE_ADDRESS or private key env vars");
}

const abi = [
  {
    inputs: [
      {
        components: [
          { name: "decisionId", type: "bytes32" },
          { name: "subject", type: "address" },
          { name: "counterparty", type: "address" },
          { name: "actionHash", type: "bytes32" },
          { name: "requestedAmount", type: "uint256" },
          { name: "maxAmount", type: "uint256" },
          { name: "snapshotHash", type: "bytes32" },
          { name: "policyVersion", type: "bytes32" },
          { name: "evaluator", type: "address" },
          { name: "issuedAt", type: "uint64" },
          { name: "expiresAt", type: "uint64" },
        ],
        name: "clearance",
        type: "tuple",
      },
      { name: "signature", type: "bytes" },
    ],
    name: "consumeClearance",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  }
];

async function runTests() {
  console.log(`Testing against VeyraTrustGate at ${trustGateAddress}...`);
  
  const now = new Date();
  const later = new Date(now.getTime() + 60000);
  const decisionId = `vtd_test_${Date.now()}`;

  const decision: any = {
    decisionId,
    subject: { agentId: "ag_1", wallet: "0x1111111111111111111111111111111111111111" },
    request: { action: "paid_api_call", counterparty: "0x2222222222222222222222222222222222222222", requestedValueUsdc: 1.5 },
    policy: { version: "v1", maxValueUsdc: 10, evaluatorAddress: "0x3333333333333333333333333333333333333333" },
    trust: { snapshotHash: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd" },
    issuedAt: now.toISOString(),
    expiresAt: later.toISOString()
  };

  const { signature, clearanceMessage, attester } = await signTrustClearance(
    decision,
    5042002,
    trustGateAddress,
    attesterPk
  );

  console.log("Signed with attester:", attester);

  // 1. Verify onchain
  console.log("Verifying onchain...");
  const verifyRes = await verifyTrustClearanceOnchain(clearanceMessage, signature, trustGateAddress);
  if (!verifyRes.valid) throw new Error("Onchain verification failed initially");
  console.log("Verification valid.");

  // 2. Consume onchain
  console.log("Consuming clearance...");
  const account = privateKeyToAccount(attesterPk);
  const client = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(process.env.ARC_TESTNET_RPC_URL)
  });
  
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(process.env.ARC_TESTNET_RPC_URL)
  });

  const txHash = await client.writeContract({
    address: trustGateAddress,
    abi,
    functionName: "consumeClearance",
    args: [clearanceMessage, signature]
  });
  
  console.log("Sent tx:", txHash);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log("Transaction mined.");

  // 3. Replay
  console.log("Testing replay protection...");
  try {
    await client.writeContract({
      address: trustGateAddress,
      abi,
      functionName: "consumeClearance",
      args: [clearanceMessage, signature]
    });
    throw new Error("Replay should have failed");
  } catch (err: any) {
    if (err.message.includes("ClearanceAlreadyConsumed") || err.message.includes("revert")) {
      console.log("Replay failed successfully as expected.");
    } else {
      throw err;
    }
  }

  console.log("All contract tests passed!");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
