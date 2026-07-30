import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import { arcTestnet } from "viem/chains";
import type { ContractTransparencySnapshot } from "./types.ts";

const IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as Hex;
const ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as Hex;

export type ContractSnapshotProvider = {
  getBytecode(address: Address): Promise<Hex | undefined>;
  getStorageAt(address: Address, slot: Hex): Promise<Hex | undefined>;
  readOwner(address: Address): Promise<Address | null>;
  readPaused(address: Address): Promise<boolean | null>;
};

function addressFromStorage(value: Hex | undefined) {
  if (!value || value === "0x" || /^0x0+$/.test(value)) return null;
  const candidate = `0x${value.slice(-40)}`;
  return isAddress(candidate) && !/^0x0{40}$/i.test(candidate)
    ? getAddress(candidate)
    : null;
}
function defaultProvider(): ContractSnapshotProvider {
  const client = createPublicClient({
    chain: arcTestnet,
    transport: http(process.env.ARC_TESTNET_RPC_URL, {
      retryCount: 1,
      timeout: 10_000,
    }),
  });
  return {
    getBytecode: (address) => client.getBytecode({ address }),
    getStorageAt: (address, slot) => client.getStorageAt({ address, slot }),
    async readOwner(address) {
      try {
        const owner = await client.readContract({
          address,
          abi: [{
            type: "function",
            name: "owner",
            stateMutability: "view",
            inputs: [],
            outputs: [{ name: "owner", type: "address" }],
          }] as const,
          functionName: "owner",
        });
        return isAddress(owner) ? getAddress(owner) : null;
      } catch {
        return null;
      }
    },
    async readPaused(address) {
      try {
        return await client.readContract({
          address,
          abi: [{
            type: "function",
            name: "paused",
            stateMutability: "view",
            inputs: [],
            outputs: [{ name: "paused", type: "bool" }],
          }] as const,
          functionName: "paused",
        });
      } catch {
        return null;
      }
    },
  };
}

export async function snapshotArcContract(
  contractAddress: string | undefined,
  provider: ContractSnapshotProvider = defaultProvider(),
  now = new Date(),
): Promise<ContractTransparencySnapshot> {
  const checkedAt = now.toISOString();
  if (!contractAddress) {
    return {
      status: "not_provided",
      network: "arc-testnet",
      chainId: 5_042_002,
      address: null,
      hasBytecode: null,
      bytecodeSize: null,
      proxyDetected: null,
      implementationAddress: null,
      adminAddress: null,
      ownerAddress: null,
      pausable: null,
      upgradeable: null,
      verificationStatus: "unavailable",
      recentEventsStatus: "unavailable",
      providerMessage: null,
      checkedAt,
    };
  }
  if (!isAddress(contractAddress)) {
    return {
      ...(await snapshotArcContract(undefined, provider, now)),
      status: "not_found",
      address: contractAddress,
      providerMessage: "The supplied value is not a valid EVM address.",
    };
  }
  const address = getAddress(contractAddress);
  try {
    const bytecode = await provider.getBytecode(address);
    if (!bytecode || bytecode === "0x") {
      return {
        ...(await snapshotArcContract(undefined, provider, now)),
        status: "not_found",
        address,
        hasBytecode: false,
        bytecodeSize: 0,
        providerMessage: "No contract bytecode was found on Arc Testnet.",
      };
    }
    const [implementationValue, adminValue, ownerAddress, paused] =
      await Promise.all([
        provider.getStorageAt(address, IMPLEMENTATION_SLOT).catch(() => undefined),
        provider.getStorageAt(address, ADMIN_SLOT).catch(() => undefined),
        provider.readOwner(address),
        provider.readPaused(address),
      ]);
    const implementationAddress = addressFromStorage(implementationValue);
    const adminAddress = addressFromStorage(adminValue);
    return {
      status: "available",
      network: "arc-testnet",
      chainId: 5_042_002,
      address,
      hasBytecode: true,
      bytecodeSize: Math.max(0, (bytecode.length - 2) / 2),
      proxyDetected: Boolean(implementationAddress),
      implementationAddress,
      adminAddress,
      ownerAddress,
      pausable: paused === null ? null : true,
      upgradeable: implementationAddress ? true : null,
      verificationStatus: "unavailable",
      recentEventsStatus: "unavailable",
      providerMessage:
        "Bytecode and standard EIP-1967/owner/paused reads were checked. Explorer source verification and event analysis are unavailable in this snapshot.",
      checkedAt,
    };
  } catch {
    return {
      ...(await snapshotArcContract(undefined, provider, now)),
      status: "unavailable",
      address,
      providerMessage:
        "Contract analysis unavailable because the Arc Testnet provider could not be read.",
    };
  }
}
