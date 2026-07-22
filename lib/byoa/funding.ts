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
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_USDC_ADDRESS, arcTestnetChain } from "../wallet/arc.ts";

export type FundingMethod = "arc_transfer" | "cctp_bridge" | "gateway_deposit";

export type FundingIntent = {
  agentId: string;
  agentWallet: string;
  method: FundingMethod;
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

const ERC20_TRANSFER_ABI = [
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
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [agentWalletFixed, BigInt(atomicAmount)],
    });

    return {
      agentId: input.agentId,
      agentWallet: agentWalletFixed,
      method: "arc_transfer",
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
    // CCTP TokenMessenger depositForBurn call simulation for Arc (Domain 26)
    const cctpTarget = "0x9f3B8679c73C2Fef8b59B4f3444d4d156fb70AA5" as Address;
    const callData = encodeFunctionData({
      abi: ERC20_TRANSFER_ABI, // simulated bridge transfer
      functionName: "transfer",
      args: [agentWalletFixed, BigInt(atomicAmount)],
    });

    return {
      agentId: input.agentId,
      agentWallet: agentWalletFixed,
      method: "cctp_bridge",
      amountUsdc: formattedUsdc,
      amountAtomic: atomicAmount,
      sourceChain: "Sepolia / External Chain",
      destinationChain: "Arc Testnet (Domain 26)",
      recipientFixed: agentWalletFixed,
      contractTarget: cctpTarget,
      callData,
      estimatedFeeUsdc: "0.000500",
      previewSummary: `CCTP Bridge: Burn & mint ${formattedUsdc} USDC to ${agentWalletFixed.slice(0, 6)}...${agentWalletFixed.slice(-4)} on Arc Testnet.`,
    };
  }

  if (input.method === "gateway_deposit") {
    // Gateway deposit target simulation
    const gatewayTarget = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" as Address;
    const callData = encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [agentWalletFixed, BigInt(atomicAmount)],
    });

    return {
      agentId: input.agentId,
      agentWallet: agentWalletFixed,
      method: "gateway_deposit",
      amountUsdc: formattedUsdc,
      amountAtomic: atomicAmount,
      sourceChain: "Arc Testnet (5042002)",
      destinationChain: "Gateway Nanopayments Pool",
      recipientFixed: agentWalletFixed,
      contractTarget: gatewayTarget,
      callData,
      estimatedFeeUsdc: "0.000200",
      previewSummary: `Gateway Deposit: Fund ${formattedUsdc} USDC into Gateway unified balance for Agent Wallet.`,
    };
  }

  throw new Error(`Unsupported funding method: ${input.method}`);
}

export async function getAgentWalletUsdcBalance(walletAddress: string): Promise<string> {
  const rpcUrl = process.env.ARC_TESTNET_RPC_URL?.trim() || arcTestnetChain.rpcUrls.default.http[0];
  const publicClient = createPublicClient({ chain: arcTestnetChain, transport: http(rpcUrl) });

  try {
    const rawBalance = await publicClient.readContract({
      address: ARC_TESTNET_USDC_ADDRESS as Address,
      abi: ERC20_TRANSFER_ABI,
      functionName: "balanceOf" as any,
      args: [getAddress(walletAddress)],
    });
    return formatUnits(rawBalance as bigint, 6);
  } catch {
    return "0.000000";
  }
}
