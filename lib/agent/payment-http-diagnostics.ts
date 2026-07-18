type HeaderLike = Headers | Record<string, string> | [string, string][] | undefined;

export type PaymentHttpExchange = {
  at: string;
  url: string;
  method: string;
  paidAttempt: boolean;
  status: number;
  statusText: string;
  requestId?: string;
  responseBody?: string;
  paymentRequired?: PaymentChallengeSummary;
  paymentResponse?: PaymentResponseSummary;
};

export type PaymentChallengeSummary = {
  x402Version?: unknown;
  resourceUrl?: unknown;
  acceptsCount: number;
  firstAccept?: {
    scheme?: unknown;
    network?: unknown;
    asset?: unknown;
    amount?: unknown;
    payTo?: unknown;
    extraName?: unknown;
    extraVersion?: unknown;
    verifyingContract?: unknown;
  };
};

export type PaymentResponseSummary = {
  success?: unknown;
  transaction?: unknown;
  network?: unknown;
  payer?: unknown;
};

function getHeader(headers: HeaderLike, name: string) {
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const lowerName = name.toLowerCase();

  if (Array.isArray(headers)) {
    return headers.find(([key]) => key.toLowerCase() === lowerName)?.[1];
  }

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) return value;
  }

  return undefined;
}

function getRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method;
  if (typeof input === "object" && "method" in input) return input.method;
  return "GET";
}

function decodeBase64Json(value: string) {
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf-8")) as unknown;
  } catch {
    return null;
  }
}

function summarizePaymentRequired(value: string): PaymentChallengeSummary | undefined {
  const decoded = decodeBase64Json(value);
  if (!decoded || typeof decoded !== "object") return undefined;

  const challenge = decoded as {
    x402Version?: unknown;
    resource?: { url?: unknown };
    accepts?: Array<{
      scheme?: unknown;
      network?: unknown;
      asset?: unknown;
      amount?: unknown;
      payTo?: unknown;
      extra?: {
        name?: unknown;
        version?: unknown;
        verifyingContract?: unknown;
      };
    }>;
  };
  const firstAccept = challenge.accepts?.[0];

  return {
    x402Version: challenge.x402Version,
    resourceUrl: challenge.resource?.url,
    acceptsCount: challenge.accepts?.length ?? 0,
    firstAccept: firstAccept
      ? {
          scheme: firstAccept.scheme,
          network: firstAccept.network,
          asset: firstAccept.asset,
          amount: firstAccept.amount,
          payTo: firstAccept.payTo,
          extraName: firstAccept.extra?.name,
          extraVersion: firstAccept.extra?.version,
          verifyingContract: firstAccept.extra?.verifyingContract,
        }
      : undefined,
  };
}

function summarizePaymentResponse(value: string): PaymentResponseSummary | undefined {
  const decoded = decodeBase64Json(value);
  if (!decoded || typeof decoded !== "object") return undefined;

  const response = decoded as PaymentResponseSummary;
  return {
    success: response.success,
    transaction: response.transaction,
    network: response.network,
    payer: response.payer,
  };
}

function sanitizeBody(value: string) {
  return value
    .replace(/"signature"\s*:\s*"[^"]+"/gi, '"signature":"[redacted]"')
    .replace(/payment-signature:\s*[^\s]+/gi, "payment-signature: [redacted]")
    .replace(/bearer\s+[a-z0-9._-]+/gi, "bearer [redacted]")
    .slice(0, 2000);
}

export function installPaymentHttpDiagnostics(baseUrl: string) {
  const previousFetch = globalThis.fetch.bind(globalThis);
  const exchanges: PaymentHttpExchange[] = [];
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await previousFetch(input, init);
    const url = getRequestUrl(input);

    if (!url.startsWith(normalizedBaseUrl)) {
      return response;
    }

    const paymentRequiredHeader = response.headers.get("PAYMENT-REQUIRED");
    const paymentResponseHeader = response.headers.get("PAYMENT-RESPONSE");

    exchanges.push({
      at: new Date().toISOString(),
      url,
      method: getRequestMethod(input, init),
      paidAttempt: Boolean(getHeader(init?.headers, "Payment-Signature")),
      status: response.status,
      statusText: response.statusText,
      requestId: response.headers.get("X-Agent-Commerce-Request-Id") ?? undefined,
      responseBody: sanitizeBody(await response.clone().text().catch(() => "")),
      paymentRequired: paymentRequiredHeader
        ? summarizePaymentRequired(paymentRequiredHeader)
        : undefined,
      paymentResponse: paymentResponseHeader
        ? summarizePaymentResponse(paymentResponseHeader)
        : undefined,
    });

    while (exchanges.length > 20) exchanges.shift();
    return response;
  }) as typeof fetch;

  return {
    getRecent(url: string) {
      return exchanges.filter((exchange) => exchange.url === url).slice(-4);
    },
    restore() {
      globalThis.fetch = previousFetch as typeof fetch;
    },
  };
}

export function printPaymentHttpDiagnostics(
  exchanges: PaymentHttpExchange[],
  runFilePath: string,
) {
  if (exchanges.length === 0) {
    console.error("No HTTP diagnostics were captured for this endpoint.");
    console.error(`Run file: ${runFilePath}`);
    return;
  }

  console.error("\nPaid endpoint HTTP diagnostics:");
  for (const exchange of exchanges) {
    console.error(
      `- ${exchange.method} ${exchange.url} paid=${exchange.paidAttempt} status=${exchange.status} requestId=${exchange.requestId ?? "n/a"}`,
    );
    if (exchange.responseBody) {
      console.error(`  body: ${exchange.responseBody}`);
    }
    if (exchange.paymentRequired) {
      console.error(`  payment-required: ${JSON.stringify(exchange.paymentRequired)}`);
    }
    if (exchange.paymentResponse) {
      console.error(`  payment-response: ${JSON.stringify(exchange.paymentResponse)}`);
    }
  }
  console.error(`Run file: ${runFilePath}`);
}
