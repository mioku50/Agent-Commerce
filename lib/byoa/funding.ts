import {
  createPublicClient,
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { ARC_TESTNET_USDC_ADDRESS, arcTestnetChain } from "../wallet/arc.ts";

export type FundingMethod = "arc_transfer" | "cctp_bridge" | "gateway_deposit";

export type FundingIntent = {
  agentId: string;
  agentWallet: string;
  method: FundingMethod;
  supported: boolean;
  unavailableReason?: string;
  amountUsdc: string;
  amountAtomic: string;
  sourceChain: string;
  destinationChain: string;
  recipientFixed: string;
  contractTarget: string;
  callData: Hex;
  estimatedFeeUsdc: string;
  previewSummary: string;
};

export const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export function buildFundingIntent(input: {
  agentId: string;
  agentWallet: string;
  method: FundingMethod;
  amountUsdc: string;
}): FundingIntent {
  const agentWalletFixed = getAddress(input.agentWallet);
  const numericAmount = Number(input.amountUsdc);

  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error("Funding amount must be a positive number.");
  }

  const atomicAmount = parseUnits(input.amountUsdc, 6).toString();
  const formattedUsdc = Number(input.amountUsdc).toFixed(6);

  if (input.method === "arc_transfer") {
    const callData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [agentWalletFixed, BigInt(atomicAmount)],
    });

    return {
      agentId: input.agentId,
      agentWallet: agentWalletFixed,
      method: "arc_transfer",
      supported: true,
      amountUsdc: formattedUsdc,
      amountAtomic: atomicAmount,
      sourceChain: "Arc Testnet (5042002)",
      destinationChain: "Arc Testnet (5042002)",
      recipientFixed: agentWalletFixed,
      contractTarget: ARC_TESTNET_USDC_ADDRESS,
      callData,
      estimatedFeeUsdc: "0.000100",
      previewSummary: `Direct Arc Transfer: Send ${formattedUsdc} USDC to ${agentWalletFixed.slice(0, 6)}...${agentWalletFixed.slice(-4)} on Arc Testnet.`,
    };
  }

  if (input.method === "cctp_bridge") {
    return {
      agentId: input.agentId,
      agentWallet: agentWalletFixed,
      method: "cctp_bridge",
      supported: false,
      unavailableReason: "Unavailable in current environment. CCTP crosschain domain binding requires mainnet or custom bridge relayer.",
      amountUsdc: formattedUsdc,
      amountAtomic: atomicAmount,
      sourceChain: "External Chain",
      destinationChain: "Arc Testnet (Domain 26)",
      recipientFixed: agentWalletFixed,
      contractTarget: "",
      callData: "0x",
      estimatedFeeUsdc: "0.000000",
      previewSummary: "CCTP Bridge is unavailable in current testnet environment.",
    };
  }

  if (input.method === "gateway_deposit") {
    return {
      agentId: input.agentId,
      agentWallet: agentWalletFixed,
      method: "gateway_deposit",
      supported: false,
      unavailableReason: "Unavailable in current environment. Gateway Nanopayments deposit pool is not active on this testnet node.",
      amountUsdc: formattedUsdc,
      amountAtomic: atomicAmount,
      sourceChain: "Arc Testnet (5042002)",
      destinationChain: "Gateway Nanopayments Pool",
      recipientFixed: agentWalletFixed,
      contractTarget: "",
      callData: "0x",
      estimatedFeeUsdc: "0.000000",
      previewSummary: "Gateway Deposit is unavailable in current testnet environment.",
    };
  }

  throw new Error(`Unsupported funding method: ${input.method}`);
}

export async function getAgentWalletUsdcBalance(walletAddress: string): Promise<string> {
  const rpcUrl = process.env.ARC_TESTNET_RPC_URL?.trim() || arcTestnetChain.rpcUrls.default.http[0];
  const publicClient = createPublicClient({ chain: arcTestnetChain, transport: http(rpcUrl) });

  const rawBalance = await publicClient.readContract({
    address: ARC_TESTNET_USDC_ADDRESS as Address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [getAddress(walletAddress)],
  });

  return formatUnits(rawBalance as bigint, 6);
}
