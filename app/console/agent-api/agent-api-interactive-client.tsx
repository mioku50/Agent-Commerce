"use me";
/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import React, { useState } from "react";
import { Check, Copy, Terminal, Code2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

const codeExamples = {
  typescript: `// TypeScript SDK Quickstart (examples/agent-api/typescript.ts)
// Run with: npx tsx examples/agent-api/typescript.ts http://localhost:3000 aac_live_your_key circlefin/agent-commerce

import { randomUUID } from "node:crypto";

const BASE_URL = process.env.API_BASE_URL || "https://agent-commerce.vercel.app";
const API_KEY = process.env.API_KEY || "aac_live_your_key_here";

async function runMachineWorkflow() {
  // 1. Discover Workflows
  const wfRes = await fetch(\`\${BASE_URL}/api/agent/v1/workflows\`, {
    headers: { Authorization: \`Bearer \${API_KEY}\` },
  });
  const { workflows } = await wfRes.json();
  console.log("Available Workflows:", workflows.map(w => w.id));

  // 2. Create Quote (Idempotent)
  const quoteRes = await fetch(\`\${BASE_URL}/api/agent/v1/quotes\`, {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${API_KEY}\`,
      "Content-Type": "application/json",
      "Idempotency-Key": \`idemp_\${randomUUID()}\`,
    },
    body: JSON.stringify({
      workflow: "github_due_diligence",
      repository: "circlefin/agent-commerce",
    }),
  });
  const quote = await quoteRes.json();
  console.log("Quote Created:", quote.quoteId, "Cost:", quote.totalUsdc, "USDC");

  // 3. Launch Execution Run
  const runRes = await fetch(\`\${BASE_URL}/api/agent/v1/runs\`, {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${API_KEY}\`,
      "Content-Type": "application/json",
      "Idempotency-Key": \`idemp_\${randomUUID()}\`,
    },
    body: JSON.stringify({ quoteId: quote.quoteId }),
  });
  const run = await runRes.json();

  // 4. Poll Execution Status
  let status = run.status;
  while (status !== "completed" && status !== "completed_with_warnings" && status !== "failed") {
    await new Promise(r => setTimeout(r, 2000));
    const poll = await fetch(\`\${BASE_URL}/api/agent/v1/runs/\${run.runId}\`, {
      headers: { Authorization: \`Bearer \${API_KEY}\` },
    });
    const pollData = await poll.json();
    status = pollData.status;
    console.log(\`Run \${run.runId} status: \${status} (\${Math.round(pollData.progress * 100)}%)\`);
  }

  // 5. Fetch Final Structured JSON Report
  const reportRes = await fetch(\`\${BASE_URL}/api/agent/v1/reports/\${run.runId}\`, {
    headers: { Authorization: \`Bearer \${API_KEY}\` },
  });
  const report = await reportRes.json();
  console.log("Executive Summary:", report.executiveSummary);
  console.log("Arc Proofs:", report.verification.proofs);
}

runMachineWorkflow().catch(console.error);`,

  python: `# Python SDK Quickstart (examples/agent-api/python.py)
# Run with: python3 examples/agent-api/python.py http://localhost:3000 aac_live_your_key circlefin/agent-commerce

import urllib.request
import json
import uuid
import time
import os

BASE_URL = os.getenv("API_BASE_URL", "https://agent-commerce.vercel.app")
API_KEY = os.getenv("API_KEY", "aac_live_your_key_here")

def api_call(method, path, payload=None, id_key=None):
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if id_key:
        headers["Idempotency-Key"] = id_key
    data = json.dumps(payload).encode() if payload else None
    req = urllib.request.Request(f"{BASE_URL}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

# 1. Discover Workflows
workflows = api_call("GET", "/api/agent/v1/workflows").get("workflows", [])
print("Workflows:", [w["id"] for w in workflows])

# 2. Create Quote
quote = api_call("POST", "/api/agent/v1/quotes", 
                 payload={"workflow": "github_due_diligence", "repository": "circlefin/agent-commerce"},
                 id_key=f"idemp_{uuid.uuid4()}")
print("Quote:", quote["quoteId"], "Cost:", quote["totalUsdc"], "USDC")

# 3. Launch Run
run = api_call("POST", "/api/agent/v1/runs", payload={"quoteId": quote["quoteId"]}, id_key=f"idemp_{uuid.uuid4()}")
print("Run ID:", run["runId"])

# 4. Poll Status
while True:
    status_data = api_call("GET", f"/api/agent/v1/runs/{run['runId']}")
    print(f"Status: {status_data['status']} ({int(status_data.get('progress',0)*100)}%)")
    if status_data["status"] in ("completed", "completed_with_warnings", "failed"):
        break
    time.sleep(2)

# 5. Fetch Final Report
report = api_call("GET", f"/api/agent/v1/reports/{run['runId']}")
print("Summary:", report["executiveSummary"])
print("Arc Proofs:", report["verification"]["proofs"])`,

  curl: `# cURL Command Sequence Quickstart

# 1. List Workflows
curl -X GET "https://agent-commerce.vercel.app/api/agent/v1/workflows" \\
  -H "Authorization: Bearer aac_live_your_key_here"

# 2. Create Quote (Include Idempotency-Key)
curl -X POST "https://agent-commerce.vercel.app/api/agent/v1/quotes" \\
  -H "Authorization: Bearer aac_live_your_key_here" \\
  -H "Idempotency-Key: idemp_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" \\
  -H "Content-Type: application/json" \\
  -d '{"workflow": "github_due_diligence", "repository": "circlefin/agent-commerce"}'

# 3. Launch Workflow Run (Sponsored or Paid)
curl -X POST "https://agent-commerce.vercel.app/api/agent/v1/runs" \\
  -H "Authorization: Bearer aac_live_your_key_here" \\
  -H "Idempotency-Key: idemp_8f7a6b5c-4d3e-2f1a-0b9c-8d7e6f5a4b3c" \\
  -H "Content-Type: application/json" \\
  -d '{"quoteId": "qte_9f81a2b3c4d5"}'

# 4. Poll Execution Status
curl -X GET "https://agent-commerce.vercel.app/api/agent/v1/runs/job_01h9a8b7c6d5" \\
  -H "Authorization: Bearer aac_live_your_key_here"

# 5. Download Structured JSON Report
curl -X GET "https://agent-commerce.vercel.app/api/agent/v1/reports/job_01h9a8b7c6d5" \\
  -H "Authorization: Bearer aac_live_your_key_here" \\
  -H "Accept: application/json"`,
};

type TabKey = keyof typeof codeExamples;

export function AgentApiInteractiveClient() {
  const [activeTab, setActiveTab] = useState<TabKey>("typescript");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeExamples[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid gap-4">
      {/* Tab Selectors */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={activeTab === "typescript" ? "default" : "outline"}
            onClick={() => setActiveTab("typescript")}
            className="gap-2 font-mono text-xs"
          >
            <Code2 className="size-3.5" />
            TypeScript
          </Button>
          <Button
            size="sm"
            variant={activeTab === "python" ? "default" : "outline"}
            onClick={() => setActiveTab("python")}
            className="gap-2 font-mono text-xs"
          >
            <Terminal className="size-3.5" />
            Python
          </Button>
          <Button
            size="sm"
            variant={activeTab === "curl" ? "default" : "outline"}
            onClick={() => setActiveTab("curl")}
            className="gap-2 font-mono text-xs"
          >
            <Play className="size-3.5" />
            cURL / Shell
          </Button>
        </div>

        <Button size="sm" variant="ghost" onClick={handleCopy} className="gap-2 text-xs">
          {copied ? (
            <>
              <Check className="size-3.5 text-emerald-500" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              Copy Snippet
            </>
          )}
        </Button>
      </div>

      {/* Code Block Container */}
      <div className="relative rounded-md bg-zinc-950 p-4 font-mono text-xs text-zinc-100 dark:bg-zinc-950">
        <pre className="overflow-x-auto whitespace-pre leading-relaxed">
          <code>{codeExamples[activeTab]}</code>
        </pre>
      </div>
    </div>
  );
}
