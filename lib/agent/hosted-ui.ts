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
