import { NextResponse, type NextRequest } from "next/server";
import { verifyTrustClearanceOffchain, verifyTrustClearanceOnchain } from "@/lib/trust-gate/verify";
import { getTrustGateEip712Domain } from "@/lib/trust-gate/sign";

export async function POST(request: NextRequest) {
  try {
    const { clearance, signature } = await request.json();
    if (!clearance || !signature) {
      return NextResponse.json({ error: "Missing clearance or signature" }, { status: 400 });
    }

    const chainId = 5042002;
    const contractAddr = (process.env.NEXT_PUBLIC_VEYRA_ERC8183_EVALUATOR_ADDRESS || "0x1cD66BCd4FCB73a079c05635840Fde029Ce6BEbB") as `0x${string}`;
    const domain = getTrustGateEip712Domain(chainId, contractAddr);

    const offchainResult = await verifyTrustClearanceOffchain(clearance, signature as `0x${string}`, domain);
    
    let onchainResult;
    if (contractAddr) {
       onchainResult = await verifyTrustClearanceOnchain(clearance, signature as `0x${string}`, contractAddr);
    }

    return NextResponse.json({
      valid: offchainResult.valid,
      signer: offchainResult.signer,
      reason: offchainResult.reason,
      onchainValid: onchainResult?.valid
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
