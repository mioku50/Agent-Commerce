/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  ExternalLink,
  Fuel,
  RefreshCw,
  Wallet,
} from "lucide-react";
import {
  createPublicClient,
  formatEther,
  formatUnits,
  http,
  type Address,
} from "viem";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_CHAIN_ID_HEX,
  ARC_TESTNET_FAUCET_URL,
  ARC_TESTNET_RPC_URL,
  ARC_TESTNET_USDC_ADDRESS,
  ARC_TESTNET_USDC_DECIMALS,
  arcTestnetChain,
  getArcExplorerAddressUrl,
} from "@/lib/wallet/arc";
import { cn, shortenHash } from "@/lib/utils";

type EthereumProvider = {
  request<T = unknown>(args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }): Promise<T>;
  on?(event: "accountsChanged" | "chainChanged", listener: (...args: unknown[]) => void): void;
  removeListener?(
    event: "accountsChanged" | "chainChanged",
    listener: (...args: unknown[]) => void,
  ): void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

type ArcWalletWidgetProps = {
  variant?: "card" | "compact";
  className?: string;
};

const erc20BalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const arcClient = createPublicClient({
  chain: arcTestnetChain,
  transport: http(ARC_TESTNET_RPC_URL),
});

function getProvider() {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

function parseChainId(value: string | number | null) {
  if (value === null) return null;
  if (typeof value === "number") return value;
  return Number.parseInt(value, 16);
}

function formatBalance(value: string | null) {
  if (!value) return "n/a";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  if (numeric === 0) return "0";
  if (numeric < 0.0001) return "<0.0001";

  return numeric.toLocaleString("en", {
    maximumFractionDigits: 4,
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
}

function isProviderError(error: unknown, code: number) {
  if (!error || typeof error !== "object") return false;

  return "code" in error && Number((error as { code?: unknown }).code) === code;
}

export function ArcWalletWidget({
  variant = "card",
  className,
}: ArcWalletWidgetProps) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [nativeBalance, setNativeBalance] = useState<string | null>(null);
  const [erc20UsdcBalance, setErc20UsdcBalance] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providerAvailable = typeof window !== "undefined" && Boolean(window.ethereum);
  const isArcTestnet = chainId === ARC_TESTNET_CHAIN_ID;

  const explorerUrl = useMemo(
    () => (address ? getArcExplorerAddressUrl(address) : null),
    [address],
  );

  const readWalletState = useCallback(async () => {
    const provider = getProvider();
    if (!provider) return;

    try {
      const [accounts, connectedChainId] = await Promise.all([
        provider.request<string[]>({ method: "eth_accounts" }),
        provider.request<string>({ method: "eth_chainId" }),
      ]);

      setAddress(accounts[0] ?? null);
      setChainId(parseChainId(connectedChainId));
      setError(null);
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }, []);

  const loadBalances = useCallback(async (walletAddress: string) => {
    setLoadingBalances(true);

    try {
      const [native, erc20] = await Promise.all([
        arcClient.getBalance({ address: walletAddress as Address }),
        arcClient.readContract({
          address: ARC_TESTNET_USDC_ADDRESS as Address,
          abi: erc20BalanceAbi,
          functionName: "balanceOf",
          args: [walletAddress as Address],
        }),
      ]);

      setNativeBalance(formatEther(native));
      setErc20UsdcBalance(formatUnits(erc20, ARC_TESTNET_USDC_DECIMALS));
      setError(null);
    } catch (caught) {
      setNativeBalance(null);
      setErc20UsdcBalance(null);
      setError(`Could not load Arc balances: ${getErrorMessage(caught)}`);
    } finally {
      setLoadingBalances(false);
    }
  }, []);

  useEffect(() => {
    void readWalletState();
  }, [readWalletState]);

  useEffect(() => {
    if (!address) return;
    void loadBalances(address);
  }, [address, loadBalances]);

  useEffect(() => {
    const provider = getProvider();
    if (!provider?.on) return;

    const handleAccountsChanged = (accounts: unknown) => {
      const nextAccounts = Array.isArray(accounts) ? accounts : [];
      setAddress(typeof nextAccounts[0] === "string" ? nextAccounts[0] : null);
    };
    const handleChainChanged = (nextChainId: unknown) => {
      setChainId(typeof nextChainId === "string" ? parseChainId(nextChainId) : null);
    };

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);

    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      setError("No injected EVM wallet was detected.");
      return;
    }

    setConnecting(true);
    try {
      const accounts = await provider.request<string[]>({
        method: "eth_requestAccounts",
      });
      const connectedChainId = await provider.request<string>({
        method: "eth_chainId",
      });

      setAddress(accounts[0] ?? null);
      setChainId(parseChainId(connectedChainId));
      setError(null);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setConnecting(false);
    }
  }, []);

  const switchToArc = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      setError("No injected EVM wallet was detected.");
      return;
    }

    setSwitching(true);
    try {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: ARC_TESTNET_CHAIN_ID_HEX }],
        });
      } catch (caught) {
        if (!isProviderError(caught, 4902)) throw caught;

        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: ARC_TESTNET_CHAIN_ID_HEX,
              chainName: "Arc Testnet",
              nativeCurrency: {
                name: "USDC",
                symbol: "USDC",
                decimals: 18,
              },
              rpcUrls: [ARC_TESTNET_RPC_URL],
              blockExplorerUrls: ["https://testnet.arcscan.app"],
            },
          ],
        });

        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: ARC_TESTNET_CHAIN_ID_HEX }],
        });
      }

      setChainId(ARC_TESTNET_CHAIN_ID);
      setError(null);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setSwitching(false);
    }
  }, []);

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {address ? (
          <>
            <Badge
              variant={isArcTestnet ? "secondary" : "outline"}
              className="max-w-[140px] gap-1.5 sm:max-w-[168px]"
            >
              <Wallet className="size-3.5" />
              <span className="truncate font-mono">{shortenHash(address, 4)}</span>
            </Badge>
            <Badge variant={isArcTestnet ? "default" : "outline"} className="hidden sm:inline-flex">
              {isArcTestnet ? "Arc Testnet" : `Chain ${chainId ?? "?"}`}
            </Badge>
            {!isArcTestnet ? (
              <Button type="button" size="sm" variant="outline" onClick={switchToArc}>
                <Fuel />
                Switch Arc
              </Button>
            ) : null}
          </>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={connect} disabled={connecting}>
            <Wallet />
            {connecting ? "Connecting..." : "Connect Wallet"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <section className={cn("rounded-lg border bg-card p-5 shadow-sm", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Browser wallet</Badge>
            <Badge variant={isArcTestnet ? "default" : "outline"}>
              {address ? (isArcTestnet ? "Arc Testnet connected" : "Wrong network") : "Read-only UX"}
            </Badge>
          </div>
          <h2 className="text-xl font-semibold">Arc Testnet Wallet</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Connect an EVM wallet to inspect Arc Testnet balances, switch
            networks, and jump into faucet, explorer, Passport, or receipts.
          </p>
        </div>
        {address ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void loadBalances(address)}
            disabled={loadingBalances}
          >
            <RefreshCw className={cn(loadingBalances && "animate-spin")} />
            Refresh
          </Button>
        ) : (
          <Button type="button" onClick={connect} disabled={connecting || !providerAvailable}>
            <Wallet />
            {connecting ? "Connecting..." : "Connect Wallet"}
          </Button>
        )}
      </div>

      {!providerAvailable ? (
        <p className="mt-4 rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
          No injected EVM wallet detected. Install or unlock a browser wallet to
          use Arc Testnet wallet actions.
        </p>
      ) : null}

      {address ? (
        <div className="mt-5 grid gap-4">
          <div className="rounded-md border bg-muted/35 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Connected wallet
                </p>
                <p className="mt-2 break-all font-mono text-sm">{address}</p>
              </div>
              <CopyButton value={address} label="Copy address" />
            </div>
          </div>

          {!isArcTestnet ? (
            <div className="flex flex-col gap-3 rounded-md border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="font-semibold text-foreground">
                    Switch to Arc Testnet
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Current network: {chainId ? `chain ${chainId}` : "unknown"}.
                    Arc Testnet is chain {ARC_TESTNET_CHAIN_ID}.
                  </p>
                </div>
              </div>
              <Button type="button" onClick={switchToArc} disabled={switching}>
                <Fuel />
                {switching ? "Switching..." : "Switch Network"}
              </Button>
            </div>
          ) : null}

          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border bg-background p-4">
              <dt className="text-sm text-muted-foreground">Native gas balance</dt>
              <dd className="mt-2 font-mono text-2xl font-semibold">
                {loadingBalances ? "Loading..." : `${formatBalance(nativeBalance)} USDC`}
              </dd>
              <p className="mt-2 text-xs text-muted-foreground">
                Arc gas uses native USDC with 18-decimal accounting.
              </p>
            </div>
            <div className="rounded-md border bg-background p-4">
              <dt className="text-sm text-muted-foreground">ERC-20 USDC balance</dt>
              <dd className="mt-2 font-mono text-2xl font-semibold">
                {loadingBalances ? "Loading..." : `${formatBalance(erc20UsdcBalance)} USDC`}
              </dd>
              <p className="mt-2 text-xs text-muted-foreground">
                Canonical Arc Testnet USDC token uses 6 decimals.
              </p>
            </div>
          </dl>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button asChild variant="outline">
              <Link href={ARC_TESTNET_FAUCET_URL} target="_blank" rel="noreferrer">
                Open Faucet
                <ExternalLink />
              </Link>
            </Button>
            {explorerUrl ? (
              <Button asChild variant="outline">
                <Link href={explorerUrl} target="_blank" rel="noreferrer">
                  Arc Explorer
                  <ExternalLink />
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href={`/agents/${address}`}>
                Agent Passport
                <BadgeCheck />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/receipts?wallet=${address}`}>Related Receipts</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
          {error}
        </p>
      ) : null}
    </section>
  );
}
