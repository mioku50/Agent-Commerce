export const HOSTED_UI_MIN_INPUT_LENGTH = 20;

export const HOSTED_REQUESTER_IDENTITY_LABEL = "Payment wallet";
export const HOSTED_REQUESTER_NOT_CHARGED_COPY =
  "Sponsored workflows will not charge your wallet.";
export const HOSTED_REQUESTER_PAYMENT_COPY =
  "Sponsored reports are free. After the free quota, this wallet confirms the displayed total price.";

export function hostedRequesterDisplayLine(address: string | null) {
  return address ? `Payment wallet ${address}` : "No payment wallet supplied.";
}

export function hostedInputPreviewHelper(inputText: string) {
  return inputText.trim().length < HOSTED_UI_MIN_INPUT_LENGTH
    ? `Enter at least ${HOSTED_UI_MIN_INPUT_LENGTH} characters to preview the workflow.`
    : null;
}

export type EvidenceState = "present" | "missing" | "unavailable";

export function getEvidenceState(
  value: boolean | undefined | null,
  isCollected: boolean,
): EvidenceState {
  if (!isCollected || value === undefined || value === null) return "unavailable";
  return value ? "present" : "missing";
}

export function formatEvidenceDisplay(
  state: EvidenceState,
  presentLabel = "Present",
  missingLabel = "Missing",
  unavailableLabel = "Unavailable",
): string {
  if (state === "present") return presentLabel;
  if (state === "missing") return missingLabel;
  return unavailableLabel;
}

export function evaluateArcVerificationState(input: {
  proofs: Array<{ receiptId?: string | null; status: string }>;
  services?: Array<{ serviceSlug: string; status: string; receiptId?: string | null }>;
  isGithubWorkflow?: boolean;
  jobStatus?: string;
}): {
  label: string;
  variant: "verified" | "partially_verified" | "pending" | "incomplete";
} {
  const { proofs, services, isGithubWorkflow, jobStatus } = input;
  if (isGithubWorkflow && services) {
    const intelService = services.find((s) => s.serviceSlug === "github-repository-intelligence");
    const analysisService = services.find((s) => s.serviceSlug === "github-due-diligence-analysis");

    const intelPaid = intelService?.status === "paid";
    const analysisPaid = analysisService?.status === "paid";

    const intelVerified = intelPaid && proofs.some((p) => p.receiptId === intelService?.receiptId && p.status === "verified");
    const analysisVerified = analysisPaid && proofs.some((p) => p.receiptId === analysisService?.receiptId && p.status === "verified");

    const verifiedCount = (intelVerified ? 1 : 0) + (analysisVerified ? 1 : 0);
    const paidCount = (intelPaid ? 1 : 0) + (analysisPaid ? 1 : 0);

    const step2Failed = analysisService?.status === "failed" || (intelPaid && jobStatus === "failed" && !analysisPaid);

    if (verifiedCount === 2) {
      return { label: "Verified on Arc", variant: "verified" };
    }

    if (verifiedCount === 1 && !step2Failed) {
      return { label: "Partially verified · 1 of 2 steps", variant: "partially_verified" };
    }

    if (step2Failed) {
      return { label: "Verification incomplete", variant: "incomplete" };
    }

    const hasPendingProofs = proofs.some((p) => p.status === "pending" || (p.status as string) === "submitted");
    if (hasPendingProofs || paidCount > verifiedCount || jobStatus === "running" || jobStatus === "queued") {
      return { label: "Verification pending", variant: "pending" };
    }

    return { label: "Verification incomplete", variant: "incomplete" };
  }

  // Fallback for non-GitHub workflows
  if (proofs.length > 0 && proofs.every((proof) => proof.status === "verified")) {
    return { label: "Verified on Arc", variant: "verified" };
  }
  if (
    proofs.length > 0 &&
    proofs.some((proof) => (proof.status as string) === "pending" || (proof.status as string) === "submitted")
  ) {
    return { label: "Verification pending", variant: "pending" };
  }
  return { label: "Verification incomplete", variant: "incomplete" };
}

