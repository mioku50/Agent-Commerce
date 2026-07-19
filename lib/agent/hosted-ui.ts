export const HOSTED_UI_MIN_INPUT_LENGTH = 20;

export const HOSTED_REQUESTER_IDENTITY_LABEL = "Requester identity";
export const HOSTED_REQUESTER_PAYMENT_COPY =
  "This wallet does not pay for hosted workflows. Payments are made by the project-owned Arc Testnet payer.";

export function hostedInputPreviewHelper(inputText: string) {
  return inputText.trim().length < HOSTED_UI_MIN_INPUT_LENGTH
    ? `Enter at least ${HOSTED_UI_MIN_INPUT_LENGTH} characters to preview the workflow.`
    : null;
}
