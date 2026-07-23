/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export type HumanizedErrorAction =
  | "switch_network"
  | "switch_wallet"
  | "refresh_price"
  | "open_agent"
  | "open_policy"
  | "retry";

export type HumanizedError = {
  title: string;
  message: string;
  action?: HumanizedErrorAction;
  actionLabel?: string;
  actionHref?: string;
  technicalCode?: string;
};

export function humanizeError(raw: unknown): HumanizedError {
  let messageStr = "";
  let reasonCode = "";

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.reason === "string") {
      reasonCode = obj.reason;
    } else if (typeof obj.code === "string") {
      reasonCode = obj.code;
    }

    if (typeof obj.error === "string") {
      messageStr = obj.error;
    } else if (typeof obj.message === "string") {
      messageStr = obj.message;
    } else if (raw instanceof Error) {
      messageStr = raw.message;
    }
  } else if (raw instanceof Error) {
    messageStr = raw.message;
  } else if (typeof raw === "string") {
    messageStr = raw;
  } else {
    messageStr = String(raw ?? "");
  }

  if (messageStr === "[object Object]") {
    messageStr = "";
  }

  // Wallet already registered
  if (
    reasonCode === "wallet_already_registered" ||
    messageStr.includes("wallet_already_registered") ||
    messageStr.includes("already registered")
  ) {
    return {
      title: "Wallet already connected",
      message: "This wallet is already assigned to an agent. Open the existing agent or use another wallet.",
      action: "open_agent",
      actionLabel: "Open Agent",
      actionHref: "/console/agents",
      technicalCode: "wallet_already_registered",
    };
  }

  // Policy denied subcases
  if (
    reasonCode.startsWith("policy_denied") ||
    reasonCode === "policy_denied" ||
    messageStr.includes("policy_denied") ||
    messageStr.includes("Policy denied")
  ) {
    if (reasonCode.includes("workflow_not_allowed") || messageStr.includes("workflow_not_allowed") || messageStr.includes("not enabled")) {
      return {
        title: "Workflow disabled",
        message: "This workflow is not enabled for the selected agent.",
        action: "open_policy",
        actionLabel: "Open Spending Policy",
        actionHref: "/console/agents",
        technicalCode: "policy_denied:workflow_not_allowed",
      };
    }
    if (reasonCode.includes("service_type_not_allowed") || messageStr.includes("service_type_not_allowed") || messageStr.includes("Live Data")) {
      return {
        title: "Required service unavailable",
        message: "This workflow requires Live Data, but Live Data is disabled in the agent policy.",
        action: "open_policy",
        actionLabel: "Enable Live Data",
        actionHref: "/console/agents",
        technicalCode: "policy_denied:service_type_not_allowed",
      };
    }
    if (reasonCode.includes("max_run_exceeded") || messageStr.includes("max_run_exceeded") || messageStr.includes("maximum amount per run")) {
      return {
        title: "Price exceeds agent limit",
        message: "This report costs more than the agent's maximum amount per run.",
        action: "open_policy",
        actionLabel: "Update Limit",
        actionHref: "/console/agents",
        technicalCode: "policy_denied:max_run_exceeded",
      };
    }
    if (reasonCode.includes("daily_spend_exceeded") || messageStr.includes("daily_spend_exceeded") || messageStr.includes("daily USDC limit")) {
      return {
        title: "Daily spending limit reached",
        message: "The agent has reached its daily USDC limit. Increase the limit or try again tomorrow.",
        action: "open_policy",
        actionLabel: "Update Limit",
        actionHref: "/console/agents",
        technicalCode: "policy_denied:daily_spend_exceeded",
      };
    }
    if (reasonCode.includes("daily_calls_exceeded") || messageStr.includes("daily_calls_exceeded") || messageStr.includes("allowed calls for today")) {
      return {
        title: "Daily run limit reached",
        message: "The agent has used all allowed calls for today.",
        action: "open_policy",
        actionLabel: "Update Limit",
        actionHref: "/console/agents",
        technicalCode: "policy_denied:daily_calls_exceeded",
      };
    }
    return {
      title: "Action denied by agent policy",
      message: "The selected action violates the agent's active spending policy.",
      action: "open_policy",
      actionLabel: "Open Spending Policy",
      actionHref: "/console/agents",
      technicalCode: "policy_denied",
    };
  }

  // Wallet mismatch
  if (
    reasonCode === "wallet_mismatch" ||
    (messageStr.includes("wallet") &&
      (messageStr.includes("differs") || messageStr.includes("mismatch") || messageStr.includes("not the registered")))
  ) {
    return {
      title: "Switch wallet to continue",
      message: "The connected wallet is not the registered agent payment wallet. Open your wallet extension and select the registered account.",
      action: "switch_wallet",
      actionLabel: "How to Switch Wallet",
      technicalCode: "wallet_mismatch",
    };
  }

  // Wrong network
  if (
    reasonCode === "wrong_network" ||
    reasonCode === "unsupported_chain" ||
    reasonCode === "chain_mismatch" ||
    reasonCode === "arc_network_required" ||
    /wrong network|unsupported chain|chain mismatch/i.test(messageStr)
  ) {
    return {
      title: "Switch to Arc Testnet",
      message: "This action requires Arc Testnet.",
      action: "switch_network",
      actionLabel: "Switch Network",
      technicalCode: "wrong_network",
    };
  }

  // Quote expired
  if (
    reasonCode === "quote_expired" ||
    messageStr.includes("quote expired") ||
    messageStr.includes("Price expired") ||
    messageStr.includes("expired")
  ) {
    return {
      title: "Price expired",
      message: "Refresh the price before continuing. No payment has been made.",
      action: "refresh_price",
      actionLabel: "Refresh Price",
      technicalCode: "quote_expired",
    };
  }

  // Credential missing or revoked
  if (
    reasonCode === "credential_missing" ||
    messageStr.includes("credential") ||
    messageStr.includes("Credential")
  ) {
    return {
      title: "Active credential required",
      message: "Create a new API credential before running this external agent.",
      action: "open_agent",
      actionLabel: "Create Credential",
      actionHref: "/console/agents",
      technicalCode: "credential_missing",
    };
  }

  // Generic fallback
  const cleanedMessage = messageStr.replace(/\s*\([a-z0-9_]+\)$/i, "").trim();

  return {
    title: "Something went wrong",
    message: cleanedMessage || "The request could not be completed. Try again.",
    action: "retry",
    actionLabel: "Try Again",
    technicalCode: reasonCode || "generic_error",
  };
}
