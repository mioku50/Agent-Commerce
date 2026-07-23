export const HOSTED_UI_MIN_INPUT_LENGTH = 20;

export const HOSTED_REQUESTER_IDENTITY_LABEL = "Requester & workflow payer";
export const HOSTED_REQUESTER_NOT_CHARGED_COPY =
  "Sponsored workflows will not charge your wallet.";
export const HOSTED_REQUESTER_PAYMENT_COPY =
  "After the sponsored quota, this wallet confirms one Arc Testnet USDC workflow payment.";

export function hostedRequesterDisplayLine(address: string | null) {
  return address ? `Requested by ${address}` : "No requester identity supplied.";
}

export function hostedInputPreviewHelper(inputText: string) {
  return inputText.trim().length < HOSTED_UI_MIN_INPUT_LENGTH
    ? `Enter at least ${HOSTED_UI_MIN_INPUT_LENGTH} characters to preview the workflow.`
    : null;
}
