import { GatewayClient } from "@circle-fin/x402-batching/client";
import { privateKeyToAccount } from "viem/accounts";
import { toErrorMessage, withRetry } from "../lib/agent/fetch-with-retry.ts";

function getPrivateKey() {
  const key = process.env.AGENT_PRIVATE_KEY?.trim() || process.env.BUYER_PRIVATE_KEY?.trim();
  if (!key) {
    throw new Error(
      "Missing AGENT_PRIVATE_KEY or BUYER_PRIVATE_KEY. Usage: AGENT_PRIVATE_KEY=0x... npm run gateway:balance",
    );
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("Wallet private key must be a 32-byte 0x-prefixed key.");
  }
  return key as `0x${string}`;
}

async function main() {
  const privateKey = getPrivateKey();
  const account = privateKeyToAccount(privateKey);
  const gateway = new GatewayClient({
    chain: "arcTestnet",
    privateKey,
  });

  console.log("Gateway balance diagnostic");
  console.log(`Wallet address: ${account.address}`);
  console.log("Network: Arc Testnet (chain ID 5042002)");

  try {
    const balances = await withRetry(
      () => gateway.getBalances(),
      {
        retries: Number(process.env.AGENT_FETCH_RETRIES ?? 3),
        timeoutMs: Number(process.env.AGENT_FETCH_TIMEOUT_MS ?? 30_000),
        label: "Gateway balance diagnostic",
      },
    );

    console.log(`Wallet USDC: ${balances.wallet.formatted}`);
    console.log(`Gateway total: ${balances.gateway.formattedTotal}`);
    console.log(`Gateway available: ${balances.gateway.formattedAvailable}`);
    console.log(`Gateway withdrawing: ${balances.gateway.formattedWithdrawing}`);
    console.log(`Gateway withdrawable: ${balances.gateway.formattedWithdrawable}`);
  } catch (error) {
    console.error(`Gateway balance check failed: ${toErrorMessage(error)}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Gateway balance diagnostic failed: ${toErrorMessage(error)}`);
  process.exit(1);
});
