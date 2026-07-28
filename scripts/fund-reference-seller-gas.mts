/** Arc Testnet-only operational helper for the reference seller gas buffer. */
import { createPublicClient, createWalletClient, getAddress, http, isAddress, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC_URL, arcTestnetChain } from "../lib/wallet/arc.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(process.argv[2] === "--confirm-arc-testnet", "Pass --confirm-arc-testnet to fund the reference seller gas buffer.");
const funderKey = process.env.BUYER_PRIVATE_KEY?.trim();
const funderAddress = process.env.BUYER_ADDRESS?.trim();
const targetAddress = process.env.REFERENCE_SELLER_WALLET?.trim() || process.env.SELLER_ADDRESS?.trim();
assert(funderKey && /^0x[0-9a-fA-F]{64}$/.test(funderKey), "BUYER_PRIVATE_KEY is required.");
assert(funderAddress && isAddress(funderAddress), "BUYER_ADDRESS is required.");
assert(targetAddress && isAddress(targetAddress), "REFERENCE_SELLER_WALLET or SELLER_ADDRESS is required.");
const funder = privateKeyToAccount(funderKey as Hex);
assert(funder.address === getAddress(funderAddress), "BUYER_ADDRESS does not match BUYER_PRIVATE_KEY.");
assert(arcTestnetChain.id === ARC_TESTNET_CHAIN_ID && arcTestnetChain.testnet === true, "Gas funding is restricted to Arc Testnet.");

const amount = process.env.P22_SELLER_GAS_FUND_USDC?.trim() || "0.01";
assert(/^\d+(?:\.\d{1,18})?$/.test(amount) && Number(amount) > 0 && Number(amount) <= 0.05, "Gas funding must be 0-0.05 test USDC.");
const transport = http(process.env.ARC_TESTNET_RPC_URL?.trim() || ARC_TESTNET_RPC_URL);
const publicClient = createPublicClient({ chain: arcTestnetChain, transport });
const walletClient = createWalletClient({ account: funder, chain: arcTestnetChain, transport });
const chainId = await publicClient.getChainId();
assert(chainId === ARC_TESTNET_CHAIN_ID, "Connected RPC is not Arc Testnet.");
const hash = await walletClient.sendTransaction({
  account: funder,
  chain: arcTestnetChain,
  to: getAddress(targetAddress),
  value: parseEther(amount),
});
const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
assert(receipt.status === "success", "Reference seller gas funding transaction failed.");
console.log(`[seller-gas-fund] Arc Testnet ${amount} test USDC funded: ${hash}`);
