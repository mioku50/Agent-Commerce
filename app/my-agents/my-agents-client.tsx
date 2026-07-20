"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Copy, KeyRound, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { shortenHash } from "@/lib/utils";

type Diagnostic = {
  configured: boolean;
  enabled: boolean;
  publicRegistrationEnabled: boolean;
  canaryOnly: boolean;
  chainId: number;
};

type AgentSummary = {
  id: string;
  publicId: string;
  displayName: string;
  ownerWallet: string;
  agentWallet: string | null;
  walletStatus: string;
  status: string;
  canaryEnabled: boolean;
  createdAt: string;
};

type AgentDetail = {
  agent: AgentSummary;
  policy: {
    allowedWorkflows: string[];
    allowedServiceTypes: string[];
    maxPricePerRunUsdc: string;
    dailySpendLimitUsdc: string;
    maxDailyCalls: number;
    status: string;
  } | null;
  credentials: Array<{
    id: string;
    label: string;
    prefix: string;
    scopes: string[];
    expiresAt: string;
    revokedAt: string | null;
  }>;
  passport: Record<string, unknown> | null;
  jobs: Array<{
    id: string;
    status: string;
    progress_stage: string;
    workflow_type: string;
    spent_usdc: string;
    agent_run_id: string | null;
    receipt_ids: string[] | null;
    proof_transaction_hashes: string[] | null;
    created_at: string;
  }>;
  payments: Array<{
    id: string;
    job_id: string | null;
    amount_usdc: string;
    status: string;
    gateway_transaction: string | null;
    receipt_count: number;
    verified_proof_count: number;
    aggregate_proof: {
      onchain_status: string;
      onchain_tx_hash: string | null;
      onchain_block_number: number | null;
    } | null;
  }>;
};

async function jsonFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `Request failed (${response.status}).`);
  return body;
}

export function MyAgentsClient({ diagnostic }: { diagnostic: Diagnostic }) {
  const wallet = useArcWallet();
  const [ownerWallet, setOwnerWallet] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [displayName, setDisplayName] = useState("Canary Research Agent");
  const [agentWallet, setAgentWallet] = useState("");
  const [bindingMessage, setBindingMessage] = useState("");
  const [bindingChallengeId, setBindingChallengeId] = useState("");
  const [bindingSignature, setBindingSignature] = useState("");
  const [newCredential, setNewCredential] = useState<string | null>(null);
  const [policyWorkflows, setPolicyWorkflows] = useState<string[]>(["sentiment_tone"]);
  const [policyServiceTypes, setPolicyServiceTypes] = useState<string[]>(["internal_deterministic"]);
  const [policyMaxRun, setPolicyMaxRun] = useState("0.005");
  const [policyDailySpend, setPolicyDailySpend] = useState("0.01");
  const [policyDailyCalls, setPolicyDailyCalls] = useState("3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(() => agents.find((agent) => agent.id === selectedId) ?? null, [agents, selectedId]);

  const loadSession = useCallback(async () => {
    const session = await jsonFetch("/api/byoa/management/session");
    const authenticated = session.authenticated === true;
    const owner = typeof session.ownerWallet === "string" ? session.ownerWallet : null;
    setOwnerWallet(authenticated ? owner : null);
    return authenticated;
  }, []);

  const loadAgents = useCallback(async () => {
    const body = await jsonFetch("/api/byoa/management/agents");
    const next = (body.agents ?? []) as AgentSummary[];
    setAgents(next);
    setSelectedId((current) => current ?? next[0]?.id ?? null);
  }, []);

  const loadDetail = useCallback(async (agentId: string) => {
    const body = await jsonFetch(`/api/byoa/management/agents/${agentId}`);
    setDetail(body as unknown as AgentDetail);
  }, []);

  useEffect(() => {
    void loadSession().then((authenticated) => authenticated ? loadAgents() : undefined).catch(() => undefined);
  }, [loadAgents, loadSession]);

  useEffect(() => {
    if (!selectedId || !ownerWallet) return;
    void loadDetail(selectedId).catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)));
  }, [loadDetail, selectedId, ownerWallet]);

  useEffect(() => {
    if (!detail?.policy) return;
    setPolicyWorkflows(detail.policy.allowedWorkflows);
    setPolicyServiceTypes(detail.policy.allowedServiceTypes);
    setPolicyMaxRun(detail.policy.maxPricePerRunUsdc);
    setPolicyDailySpend(detail.policy.dailySpendLimitUsdc);
    setPolicyDailyCalls(String(detail.policy.maxDailyCalls));
  }, [detail]);

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await action(); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  }

  async function verifyOwner() {
    await act(async () => {
      if (!wallet.address) throw new Error("Connect the owner wallet first.");
      if (!wallet.isArcTestnet) await wallet.switchToArc();
      const created = await jsonFetch("/api/byoa/management/challenges", {
        method: "POST",
        body: JSON.stringify({ wallet: wallet.address }),
      });
      const challenge = created.challenge as { id: string; message: string };
      const signature = await wallet.signMessage(challenge.message);
      const session = await jsonFetch("/api/byoa/management/session", {
        method: "POST",
        body: JSON.stringify({ challengeId: challenge.id, message: challenge.message, signature }),
      });
      setOwnerWallet(session.ownerWallet as string);
      await loadAgents();
    });
  }

  async function endOwnerSession() {
    await act(async () => {
      await jsonFetch("/api/byoa/management/session", { method: "DELETE" });
      setOwnerWallet(null);
      setAgents([]);
      setSelectedId(null);
      setDetail(null);
      setNewCredential(null);
    });
  }

  async function createAgent() {
    await act(async () => {
      const body = await jsonFetch("/api/byoa/management/agents", {
        method: "POST",
        body: JSON.stringify({ displayName, agentWallet }),
      });
      const created = body.agent as AgentSummary;
      await loadAgents();
      setSelectedId(created.id);
      setDetail(null);
    });
  }

  async function createBindingChallenge() {
    if (!selected) return;
    await act(async () => {
      const body = await jsonFetch(`/api/byoa/management/agents/${selected.id}/wallet-challenge`, { method: "POST", body: "{}" });
      const challenge = body.challenge as { id: string; message: string };
      setBindingChallengeId(challenge.id);
      setBindingMessage(challenge.message);
      setBindingSignature("");
    });
  }

  async function signBindingWithConnectedWallet() {
    await act(async () => {
      if (!selected?.agentWallet || wallet.address?.toLowerCase() !== selected.agentWallet.toLowerCase()) {
        throw new Error("Switch the connected wallet to the registered external agent wallet first.");
      }
      if (!wallet.isArcTestnet) await wallet.switchToArc();
      setBindingSignature(await wallet.signMessage(bindingMessage));
    });
  }

  async function verifyBinding() {
    if (!selected) return;
    await act(async () => {
      await jsonFetch(`/api/byoa/management/agents/${selected.id}/verify-wallet`, {
        method: "POST",
        body: JSON.stringify({ challengeId: bindingChallengeId, message: bindingMessage, signature: bindingSignature }),
      });
      setBindingMessage("");
      setBindingChallengeId("");
      setBindingSignature("");
      await loadAgents();
      await loadDetail(selected.id);
    });
  }

  async function savePolicy() {
    if (!selected) return;
    await act(async () => {
      await jsonFetch(`/api/byoa/management/agents/${selected.id}/policy`, {
        method: "PUT",
        body: JSON.stringify({
          allowedWorkflows: policyWorkflows,
          allowedServiceTypes: policyServiceTypes,
          maxPricePerRunUsdc: Number(policyMaxRun),
          dailySpendLimitUsdc: Number(policyDailySpend),
          maxDailyCalls: Number(policyDailyCalls),
          status: "active",
        }),
      });
      await loadDetail(selected.id);
    });
  }

  async function issueCredential() {
    if (!selected) return;
    await act(async () => {
      const body = await jsonFetch(`/api/byoa/management/agents/${selected.id}/credentials`, {
        method: "POST",
        body: JSON.stringify({
          label: "Canary workflow credential",
          scopes: ["manifest:read", "quotes:create", "workflows:execute", "results:read"],
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString(),
        }),
      });
      setNewCredential(body.token as string);
      await loadDetail(selected.id);
    });
  }

  async function rotateCredential(credentialId: string) {
    if (!selected) return;
    await act(async () => {
      const body = await jsonFetch(`/api/byoa/management/agents/${selected.id}/credentials/${credentialId}`, {
        method: "POST",
        body: "{}",
      });
      setNewCredential(body.token as string);
      await loadDetail(selected.id);
    });
  }

  async function revokeCredential(credentialId: string) {
    if (!selected) return;
    await act(async () => {
      await jsonFetch(`/api/byoa/management/agents/${selected.id}/credentials/${credentialId}`, { method: "DELETE" });
      await loadDetail(selected.id);
    });
  }

  if (!diagnostic.configured || !diagnostic.enabled) {
    return <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6"><Card><CardContent className="p-6"><p className="font-medium">BYOA canary is closed.</p><p className="mt-2 text-sm text-muted-foreground">The server feature flag and canary allowlists must be configured before registration. Public registration remains disabled.</p></CardContent></Card></section>;
  }

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6">
      {error ? <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="size-5" />Owner management session</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">The owner wallet authorizes management only. It is never used as the workflow payer unless it is also deliberately registered as the external agent wallet.</p>
          <div className="flex flex-wrap items-center gap-3">
            {wallet.address ? <Badge variant="outline">Connected {shortenHash(wallet.address, 7)}</Badge> : null}
            {ownerWallet ? <Badge>Verified owner {shortenHash(ownerWallet, 7)}</Badge> : null}
            {!wallet.address ? <Button onClick={() => void wallet.connect()} disabled={busy}>Connect owner wallet</Button> : <Button onClick={() => void verifyOwner()} disabled={busy || Boolean(ownerWallet)}><ShieldCheck />Verify owner wallet</Button>}
            {ownerWallet ? <Button variant="outline" onClick={() => void endOwnerSession()} disabled={busy}>End management session</Button> : null}
          </div>
        </CardContent>
      </Card>

      {ownerWallet ? <>
        <Card>
          <CardHeader><CardTitle>Register an external agent</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor="agent-name">Agent name</Label><Input id="agent-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></div>
            <div className="grid gap-2"><Label htmlFor="agent-wallet">External agent Arc wallet</Label><Input id="agent-wallet" placeholder="0x…" value={agentWallet} onChange={(event) => setAgentWallet(event.target.value)} /></div>
            <div className="sm:col-span-2"><Button onClick={() => void createAgent()} disabled={busy || !agentWallet}><Bot />Create agent</Button></div>
          </CardContent>
        </Card>

        {agents.length ? <div className="grid gap-3 md:grid-cols-2">{agents.map((agent) => <button key={agent.id} type="button" onClick={() => setSelectedId(agent.id)} className={`rounded-lg border p-4 text-left ${selectedId === agent.id ? "border-primary bg-primary/5" : ""}`}><div className="flex flex-wrap gap-2"><Badge>{agent.status}</Badge><Badge variant="outline">wallet {agent.walletStatus}</Badge></div><p className="mt-3 font-semibold">{agent.displayName}</p><p className="mt-1 break-all font-mono text-xs text-muted-foreground">{agent.publicId}</p><p className="mt-1 break-all font-mono text-xs text-muted-foreground">{agent.agentWallet}</p></button>)}</div> : null}

        {selected && detail ? <>
          <Card>
            <CardHeader><CardTitle>1. Verify external agent wallet</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm text-muted-foreground">The one-time challenge binds origin, Arc chain 5042002, agent public ID, wallet, action, nonce and expiry. The signature authorizes no payment.</p>
              <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void createBindingChallenge()} disabled={busy || selected.walletStatus === "verified"}>Create challenge</Button>{selected.walletStatus === "verified" ? <Badge>Wallet verified</Badge> : null}</div>
              {bindingMessage ? <><textarea aria-label="Agent wallet challenge" readOnly rows={11} value={bindingMessage} className="min-h-40 w-full rounded-md border bg-transparent px-3 py-2 font-mono text-xs" /><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void signBindingWithConnectedWallet()} disabled={busy}>Sign with connected agent wallet</Button></div><Label htmlFor="binding-signature">Agent wallet signature</Label><textarea id="binding-signature" rows={4} value={bindingSignature} onChange={(event) => setBindingSignature(event.target.value)} placeholder="0x…" className="w-full rounded-md border bg-transparent px-3 py-2 font-mono text-xs" /><Button onClick={() => void verifyBinding()} disabled={busy || !bindingSignature}>Verify and activate</Button></> : null}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>2. Spending policy</CardTitle></CardHeader><CardContent className="grid gap-4 text-sm"><fieldset className="grid gap-2"><legend className="font-medium">Allowed workflows</legend>{["sentiment_tone", "builder_update", "market_context", "custom_task"].map((value) => <label key={value} className="flex items-center gap-2"><input type="checkbox" checked={policyWorkflows.includes(value)} onChange={(event) => setPolicyWorkflows((current) => event.target.checked ? [...new Set([...current, value])] : current.filter((entry) => entry !== value))} />{value}</label>)}</fieldset><fieldset className="grid gap-2"><legend className="font-medium">Allowed service types</legend>{["internal_deterministic", "live_provider", "seller_created", "external_seller"].map((value) => <label key={value} className="flex items-center gap-2"><input type="checkbox" checked={policyServiceTypes.includes(value)} onChange={(event) => setPolicyServiceTypes((current) => event.target.checked ? [...new Set([...current, value])] : current.filter((entry) => entry !== value))} />{value}</label>)}</fieldset><div className="grid gap-3 sm:grid-cols-3"><div><Label htmlFor="max-run">Max/run USDC</Label><Input id="max-run" inputMode="decimal" value={policyMaxRun} onChange={(event) => setPolicyMaxRun(event.target.value)} /></div><div><Label htmlFor="daily-spend">Daily USDC</Label><Input id="daily-spend" inputMode="decimal" value={policyDailySpend} onChange={(event) => setPolicyDailySpend(event.target.value)} /></div><div><Label htmlFor="daily-calls">Daily calls</Label><Input id="daily-calls" inputMode="numeric" value={policyDailyCalls} onChange={(event) => setPolicyDailyCalls(event.target.value)} /></div></div><Button variant="outline" onClick={() => void savePolicy()} disabled={busy || policyWorkflows.length === 0 || policyServiceTypes.length === 0}>Save atomic policy</Button></CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-5" />3. API credential</CardTitle></CardHeader><CardContent className="grid gap-3"><p className="text-sm text-muted-foreground">Credentials are HMAC-SHA256 hashes at rest. Plaintext is returned exactly once.</p><Button onClick={() => void issueCredential()} disabled={busy || selected.status !== "active"}>Issue scoped credential</Button>{newCredential ? <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3"><p className="text-sm font-medium">Copy now — it cannot be recovered</p><code className="mt-2 block break-all text-xs">{newCredential}</code><Button size="sm" variant="outline" className="mt-3" onClick={() => void navigator.clipboard.writeText(newCredential)}><Copy />Copy</Button></div> : null}<div className="grid gap-2">{detail.credentials.map((credential) => <div key={credential.id} className="rounded-md border p-3 text-xs"><p className="font-medium">{credential.label} · {credential.prefix}</p><p className="mt-1 text-muted-foreground">{credential.scopes.join(", ")}</p><p className="mt-1">{credential.revokedAt ? "revoked" : `expires ${new Date(credential.expiresAt).toLocaleDateString()}`}</p>{!credential.revokedAt ? <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void rotateCredential(credential.id)} disabled={busy}>Rotate</Button><Button size="sm" variant="destructive" onClick={() => void revokeCredential(credential.id)} disabled={busy}>Revoke</Button></div> : null}</div>)}</div></CardContent></Card>
          </div>

          <Card><CardHeader><CardTitle>Usage, runs, receipts and proofs</CardTitle></CardHeader><CardContent className="grid gap-4"><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href={`/agents/byoa/${selected.publicId}`}>Public Agent Passport</Link></Button><Button variant="outline" onClick={() => void loadDetail(selected.id)} disabled={busy}><RefreshCw />Refresh</Button></div><p className="text-sm text-muted-foreground">{detail.jobs.length} recent registered-agent runs · {detail.payments.length} aggregate workflow payments. Owner history links the external-agent payment to downstream receipts and verified Arc proofs without exposing credentials or source input.</p><div className="grid gap-3">{detail.jobs.map((job) => <div key={job.id} className="rounded-md border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-2"><Badge>{job.status}</Badge><Badge variant="outline">{job.workflow_type}</Badge><span className="font-mono text-xs">{job.spent_usdc} USDC downstream</span></div>{job.agent_run_id ? <Button asChild size="sm" variant="outline"><Link href={`/runs/${job.agent_run_id}`}>Agent Run</Link></Button> : null}</div><div className="mt-3 flex flex-wrap gap-2">{(job.receipt_ids ?? []).map((receiptId) => <Button key={receiptId} asChild size="sm" variant="ghost"><Link href={`/receipts/${receiptId}`}>Receipt {shortenHash(receiptId, 5)}</Link></Button>)}{(job.proof_transaction_hashes ?? []).map((hash) => <Button key={hash} asChild size="sm" variant="ghost"><a href={`https://testnet.arcscan.app/tx/${hash}`} target="_blank" rel="noreferrer">Arc proof {shortenHash(hash, 5)}</a></Button>)}</div></div>)}{detail.jobs.length === 0 ? <p className="text-sm text-muted-foreground">No BYOA workflows have run yet.</p> : null}</div><div className="grid gap-2">{detail.payments.map((payment) => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-xs"><div><p className="font-medium">Aggregate workflow payment · {payment.amount_usdc} USDC</p><p className="mt-1 text-muted-foreground">{payment.status} · {payment.receipt_count} receipts · {payment.verified_proof_count} verified proofs</p></div>{payment.aggregate_proof?.onchain_tx_hash ? <Button asChild size="sm" variant="outline"><a href={`https://testnet.arcscan.app/tx/${payment.aggregate_proof.onchain_tx_hash}`} target="_blank" rel="noreferrer">Aggregate proof · {payment.aggregate_proof.onchain_status}</a></Button> : <Badge variant="outline">Aggregate proof {payment.aggregate_proof?.onchain_status ?? "pending"}</Badge>}</div>)}</div></CardContent></Card>

          <IntegrationExamples publicId={selected.publicId} />
        </> : null}
      </> : null}
    </section>
  );
}

function IntegrationExamples({ publicId }: { publicId: string }) {
  const sample = `const API = "https://agent-commerce-six.vercel.app";
const credential = process.env.BYOA_API_CREDENTIAL; // stays in your agent runtime
const idempotencyKey = crypto.randomUUID();

// 1. Discover safe capabilities.
await fetch(\`${"${API}"}/api/byoa/manifest\`);

// 2. Reserve an immutable, policy-checked quote.
const quote = await fetch(\`${"${API}"}/api/byoa/v1/quotes\`, {
  method: "POST",
  headers: { Authorization: \`Bearer ${"${credential}"}\`, "Idempotency-Key": idempotencyKey, "Content-Type": "application/json" },
  body: JSON.stringify({ workflowType: "market_context", task: "Create an ETH market brief", inputText, marketSymbol: "ETH/USD", budgetUsdc: 0.005 })
}).then(r => r.json());

// 3. POST quote.quote.resourceUrl without PAYMENT-SIGNATURE → HTTP 402.
// 4. Your external agent wallet signs the exact Gateway acceptance locally.
// 5. Retry with PAYMENT-SIGNATURE; poll the returned statusUrl.
// Reuse the same Idempotency-Key: ${publicId} will never be charged twice for the same quote.`;
  return <Card><CardHeader><CardTitle>Manifest → quote → HTTP 402 → payment → execute → poll</CardTitle></CardHeader><CardContent><p className="mb-3 text-sm text-muted-foreground">The external agent keeps its signer locally. Arc Agent Commerce receives only the signed x402 payload and the scoped API credential.</p><pre className="max-w-full overflow-x-auto rounded-md bg-black/40 p-4 text-xs leading-5"><code>{sample}</code></pre></CardContent></Card>;
}
