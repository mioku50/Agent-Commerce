# `@arc-agent-commerce/sdk`

Typed, dependency-free TypeScript client for Veyra Agent API v1.

The SDK covers workflow discovery, immutable quotes, idempotent run creation,
polling, structured reports, Markdown export, normalized errors, and Arc proof
metadata. It works in Node.js 20+ and runtimes that provide `fetch`,
`AbortController`, and `crypto.randomUUID`.

```ts
import { AgentCommerceClient } from "@arc-agent-commerce/sdk";

const client = new AgentCommerceClient({
  baseUrl: "https://agent-commerce-six.vercel.app",
  credential: process.env.ARC_AGENT_COMMERCE_API_KEY!,
});

const { report } = await client.executeWorkflow({
  workflow: "github_due_diligence",
  repository: "circlefin/developer-controlled-wallets-web-sdk",
});

console.log(report.verdict, report.verification);
```

Mutating methods create a fresh `Idempotency-Key` by default. For durable agent
runs, persist and pass your own quote and run idempotency keys so process
restarts replay the same operation.

Paid quotes require an existing Arc Testnet transaction authorization. Pass
`paymentAuthorization` or a callback that creates the transaction after
checking the immutable quote. The SDK never signs or sends funds by itself.
