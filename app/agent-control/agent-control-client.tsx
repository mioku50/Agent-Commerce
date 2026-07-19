"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bot,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Filter,
  ShieldCheck,
} from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DEFAULT_AGENT_BUDGET_USDC,
  DEFAULT_AGENT_TASK,
  formatUsdc,
} from "@/lib/agent/planner";

type PlanDecisionSummary = {
  decision: "selected" | "skipped";
  reasoning: string;
  expectedPriceUsd: number;
  remainingBudgetUsd: number;
  service: {
    id: string;
    slug: string;
    name: string;
    shortDescription: string;
    category: string;
    method: "GET" | "POST";
    endpoint: string;
    priceLabel: string;
    priceUsd: number;
    status: string;
    sourceType: string;
    isPaid: boolean;
  };
};

type PlanResponse = {
  task: string;
  budgetUsdc: number;
  estimatedSpendUsdc: number;
  remainingBudgetUsdc: number;
  selected: PlanDecisionSummary[];
  skipped: PlanDecisionSummary[];
  decisions: PlanDecisionSummary[];
  warnings: string[];
  localCommand: string;
  note: string;
};

type AgentControlClientProps = {
  categories: string[];
};

function isPlanResponse(value: PlanResponse | { error?: string }): value is PlanResponse {
  return (
    "selected" in value &&
    "skipped" in value &&
    "localCommand" in value &&
    Array.isArray(value.selected) &&
    Array.isArray(value.skipped)
  );
}

function parseNumberInput(value: string, fallback: number) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sourceLabel(sourceType: string) {
  if (sourceType === "static") return "Internal deterministic";
  if (sourceType === "provider_backed") return "Live Provider";
  if (sourceType === "seller_mock") return "Seller-created mock";
  return "Seller-created placeholder";
}

function DecisionCard({ decision }: { decision: PlanDecisionSummary }) {
  const selected = decision.decision === "selected";

  return (
    <Card className={cn("rounded-lg shadow-sm", selected ? "border-primary/35" : "")}>
      <CardHeader>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant={selected ? "default" : "outline"}>
            {selected ? "Selected" : "Skipped"}
          </Badge>
          <Badge variant="secondary">{decision.service.category}</Badge>
          <Badge variant="outline">{decision.service.method}</Badge>
          <Badge variant={decision.service.sourceType === "static" ? "outline" : "secondary"}>
            {sourceLabel(decision.service.sourceType)}
          </Badge>
        </div>
        <CardTitle className="text-xl">{decision.service.name}</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          {decision.service.shortDescription}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Price</dt>
            <dd className="font-mono">{decision.service.priceLabel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Remaining</dt>
            <dd className="font-mono">{formatUsdc(decision.remainingBudgetUsd)} USDC</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Endpoint</dt>
            <dd className="break-all font-mono text-xs">{decision.service.endpoint}</dd>
          </div>
        </dl>
        <p className="rounded-md bg-secondary p-3 text-sm leading-6 text-secondary-foreground">
          {decision.reasoning}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/store/${decision.service.slug}`}>
              Details
              <ExternalLink />
            </Link>
          </Button>
          <CopyButton value={decision.service.endpoint} label="Copy endpoint" />
        </div>
      </CardContent>
    </Card>
  );
}

export function AgentControlClient({ categories }: AgentControlClientProps) {
  const [task, setTask] = useState(
    "Analyze the sentiment and tone of an Arc Agent Commerce demo using paid APIs only when useful.",
  );
  const [budget, setBudget] = useState("0.005");
  const [maxPrice, setMaxPrice] = useState("");
  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);
  const [allowSellerCreated, setAllowSellerCreated] = useState(true);
  const [allowOfficial, setAllowOfficial] = useState(true);
  const [mode, setMode] = useState<"dry-run" | "scripted" | "live">("dry-run");
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const estimatedCommand = useMemo(() => {
    const safeTask = (task.trim() || DEFAULT_AGENT_TASK).replace(/"/g, '\\"');
    const limit = formatUsdc(parseNumberInput(budget, DEFAULT_AGENT_BUDGET_USDC));
    return `AGENT_MAX_IN_FLIGHT=1 npm run agent -- --task "${safeTask}" --limit ${limit}`;
  }, [budget, task]);

  function toggleCategory(category: string, checked: boolean | "indeterminate") {
    setPreferredCategories((current) => {
      if (checked === true) return Array.from(new Set([...current, category]));
      return current.filter((item) => item !== category);
    });
  }

  async function submitPlan() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task,
          budgetUsdc: budget,
          preferredCategories,
          maxServicePriceUsd: maxPrice,
          allowSellerCreated,
          allowOfficial,
        }),
      });
      const data = (await response.json()) as PlanResponse | { error?: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Planner request failed.");
      }
      if (!isPlanResponse(data)) {
        throw new Error("Planner response was missing plan details.");
      }

      setPlan(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-8 px-8 py-12 lg:grid-cols-[420px_1fr]">
      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">No browser payments</Badge>
            <Badge variant="outline">Dry-run planner</Badge>
          </div>
          <CardTitle className="text-2xl">Configure buyer-agent policy</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="agent-task">Task</Label>
            <textarea
              id="agent-task"
              value={task}
              onChange={(event) => setTask(event.target.value)}
              className="min-h-32 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm shadow-primary/5 outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/20"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="budget">Budget USDC</Label>
              <Input
                id="budget"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="max-price">Max service price</Label>
              <Input
                id="max-price"
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value)}
                inputMode="decimal"
                placeholder="Any"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Mode</Label>
            <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/25 p-1">
              {[
                ["dry-run", "Dry-run"],
                ["scripted", "Scripted"],
                ["live", "Live"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value as "dry-run" | "scripted" | "live")}
                  className={cn(
                    "rounded-md px-3 py-2 text-xs font-semibold transition-colors",
                    mode === value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Browser planning is read-only; live paid execution still runs in the local CLI.
            </p>
          </div>

          <div className="grid gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="allow-seller"
                checked={allowSellerCreated}
                onCheckedChange={(checked) => setAllowSellerCreated(checked === true)}
              />
              <Label htmlFor="allow-seller">Allow seller-created services</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="allow-official"
                checked={allowOfficial}
                onCheckedChange={(checked) => setAllowOfficial(checked === true)}
              />
              <Label htmlFor="allow-official">Allow official sample services</Label>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Filter className="size-4" />
              Preferred categories
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {categories.map((category) => (
                <label key={category} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={preferredCategories.includes(category)}
                    onCheckedChange={(checked) => toggleCategory(category, checked)}
                  />
                  {category}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Leave all unchecked to let the agent consider every category.
            </p>
          </div>

          <Button onClick={submitPlan} disabled={loading}>
            <ClipboardList />
            {loading ? "Planning..." : "Plan dry run"}
          </Button>

          {error ? (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-5">
        <Card className="rounded-lg shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <ShieldCheck className="size-5" />
              Local command
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm leading-6 text-muted-foreground">
              The browser only plans. Paid x402 requests still run through the
              local CLI agent with local environment variables and wallet keys.
            </p>
            <div className="rounded-md bg-muted p-3 font-mono text-xs leading-5">
              {plan?.localCommand ?? estimatedCommand}
            </div>
            <CopyButton value={plan?.localCommand ?? estimatedCommand} label="Copy command" />
            {mode !== "dry-run" ? (
              <p className="text-xs text-muted-foreground">
                This command intentionally omits `AGENT_PRIVATE_KEY`.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {plan ? (
          <>
            <section className="grid gap-4 sm:grid-cols-3">
              <Card className="rounded-lg">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Selected</p>
                  <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-foreground">
                    {plan.selected.length}
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-lg">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Estimated spend</p>
                  <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-foreground">
                    {formatUsdc(plan.estimatedSpendUsdc)}
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-lg">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Remaining budget</p>
                  <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-foreground">
                    {formatUsdc(plan.remainingBudgetUsdc)}
                  </p>
                </CardContent>
              </Card>
            </section>

            {plan.warnings.length > 0 ? (
              <Card className="rounded-lg border-amber-300 bg-amber-50 text-amber-950">
                <CardContent className="grid gap-2 p-4 text-sm">
                  {plan.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            <section className="grid gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-primary" />
                <h2 className="text-2xl font-semibold">Selected services</h2>
              </div>
              {plan.selected.length > 0 ? (
                plan.selected.map((decision) => (
                  <DecisionCard key={decision.service.id} decision={decision} />
                ))
              ) : (
                <Card className="rounded-lg">
                  <CardContent className="p-5 text-sm text-muted-foreground">
                    No services selected for this policy.
                  </CardContent>
                </Card>
              )}
            </section>

            <section className="grid gap-4">
              <div className="flex items-center gap-2">
                <Bot className="size-5 text-muted-foreground" />
                <h2 className="text-2xl font-semibold">Skipped services</h2>
              </div>
              <div className="grid gap-3">
                {plan.skipped.map((decision) => (
                  <DecisionCard key={decision.service.id} decision={decision} />
                ))}
              </div>
            </section>
          </>
        ) : (
          <Card className="rounded-lg shadow-sm">
            <CardContent className="p-6 text-sm leading-6 text-muted-foreground">
              Run a dry plan to see selected and skipped services, reasoning,
              budget impact, and the matching local CLI command.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
