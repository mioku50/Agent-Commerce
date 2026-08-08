import { NextResponse, type NextRequest } from "next/server";
import { evaluateTrustDecision } from "@/lib/trust-gate/decision";

export async function GET(request: NextRequest, context: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await context.params;
    
    const erc8183Decision = await evaluateTrustDecision({
      subjectAgentId: agentId,
      action: "erc8183_job",
      requestedValueUsdc: 0
    });

    const x402Decision = await evaluateTrustDecision({
      subjectAgentId: agentId,
      action: "x402_payment",
      requestedValueUsdc: 0
    });

    return NextResponse.json({
      agentId,
      limits: {
        erc8183_job: {
          maxUsdc: erc8183Decision.policy.maxValueUsdc,
          decision: erc8183Decision.decision
        },
        x402_payment: {
          maxUsdc: x402Decision.policy.maxValueUsdc,
          decision: x402Decision.decision
        }
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
