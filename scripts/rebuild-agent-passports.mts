import {
  rebuildAgentPassports,
  type AgentPassportRebuildResult,
} from "../lib/agent/passport-persistence.ts";

function parseArgs() {
  const args = process.argv.slice(2);
  const walletFlagIndex = args.findIndex((arg) => arg === "--wallet");
  const inlineWallet = args.find((arg) => arg.startsWith("--wallet="));

  if (inlineWallet) {
    return {
      wallet: inlineWallet.split("=").slice(1).join("=").trim() || null,
    };
  }

  if (walletFlagIndex >= 0) {
    return {
      wallet: args[walletFlagIndex + 1]?.trim() || null,
    };
  }

  return {
    wallet: null,
  };
}

function printResult(result: AgentPassportRebuildResult) {
  console.log(
    [
      `wallet=${result.wallet}`,
      `runs=${result.runs}`,
      `steps=${result.steps}`,
      `events=${result.reputationEvents}`,
      `trust=${result.profile.trust_score}`,
      `spent=${result.profile.total_usdc_spent}`,
    ].join(" "),
  );
}

async function main() {
  const { wallet } = parseArgs();

  console.log("Rebuilding Agent Passports from agent_runs and agent_purchase_steps...");
  if (wallet) {
    console.log(`Wallet filter: ${wallet}`);
  }

  const results = await rebuildAgentPassports({ wallet });

  if (results.length === 0) {
    console.log("No agent profiles were rebuilt. Check Supabase env vars and agent_runs data.");
    return;
  }

  for (const result of results) {
    printResult(result);
  }

  const totals = results.reduce(
    (acc, result) => {
      acc.runs += result.runs;
      acc.steps += result.steps;
      acc.events += result.reputationEvents;
      return acc;
    },
    { runs: 0, steps: 0, events: 0 },
  );

  console.log(
    `Rebuild complete: profiles=${results.length} runs=${totals.runs} steps=${totals.steps} events=${totals.events}`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Agent Passport rebuild failed: ${message}`);
  process.exit(1);
});
