# Veyra Trust Webhooks

Veyra sends public-safe Continuous Trust Monitoring events after a canonical
snapshot is stored. Webhook delivery is separate from the monitoring
transaction: a destination failure cannot roll back a snapshot or public Trust
Profile.

Create subscriptions in **Monitoring → Settings → Webhooks** or through Veyra
Agent API. The signing secret starts with `vwhsec_`, is shown once, and must be
stored in a secret manager.

## Delivery contract

Every delivery is an HTTPS `POST` with:

```http
Veyra-Event-Id: evt_...
Veyra-Event-Type: risk_added
Veyra-Timestamp: 1785432600
Veyra-Signature: v1=<hex-hmac>
User-Agent: Veyra-Webhooks/1.0
Content-Type: application/json
```

The signature input is the exact raw request body:

```text
HMAC_SHA256(webhookSecret, `${timestamp}.${rawBody}`)
```

During the ten-minute secret-rotation grace period,
`Veyra-Signature` contains two comma-separated `v1=` signatures. Accept the
request when either signature matches an active secret.

Reject timestamps more than five minutes away from the receiver clock and
deduplicate by `Veyra-Event-Id`. Do not parse and reserialize JSON before
verification.

## TypeScript verification

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyVeyraWebhook(input: {
  rawBody: string;
  timestamp: string;
  signatureHeader: string;
  secret: string;
}) {
  const timestamp = Number(input.timestamp);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) return false;

  const expected = createHmac("sha256", input.secret)
    .update(`${timestamp}.${input.rawBody}`)
    .digest("hex");

  return input.signatureHeader.split(",").some((candidate) => {
    const received = candidate.trim().replace(/^v1=/, "");
    if (!/^[0-9a-f]{64}$/.test(received)) return false;
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(received, "hex"),
    );
  });
}
```

In a Next.js route, read `await request.text()` once, verify it, then call
`JSON.parse(rawBody)`.

## Python verification

```python
import hashlib
import hmac
import time

def verify_veyra_webhook(raw_body: bytes, timestamp: str,
                         signature_header: str, secret: str) -> bool:
    ts = int(timestamp)
    if abs(int(time.time()) - ts) > 300:
        return False

    signed = str(ts).encode() + b"." + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    candidates = [
        item.strip().removeprefix("v1=")
        for item in signature_header.split(",")
    ]
    return any(hmac.compare_digest(expected, value) for value in candidates)
```

## cURL/manual debugging

Generate a local signature without printing the secret:

```bash
read -rsp "Webhook secret: " VEYRA_WEBHOOK_SECRET
echo
timestamp="$(date +%s)"
body='{"id":"evt_test_example","type":"test","createdAt":"2026-07-30T17:30:00.000Z","apiVersion":"2026-07-30","data":{"message":"Veyra webhook connection verified."}}'
signature="$(printf '%s' "${timestamp}.${body}" | openssl dgst -sha256 -hmac "$VEYRA_WEBHOOK_SECRET" -hex | sed 's/^.* //')"

curl -X POST 'https://your.example/webhooks/veyra' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: Veyra-Webhooks/1.0' \
  -H 'Veyra-Event-Id: evt_test_example' \
  -H 'Veyra-Event-Type: test' \
  -H "Veyra-Timestamp: $timestamp" \
  -H "Veyra-Signature: v1=$signature" \
  --data-binary "$body"

unset VEYRA_WEBHOOK_SECRET signature body timestamp
```

## Retries and safety

HTTP `200–299` is success. Other responses and sanitized transport failures are
retried after approximately 1 minute, 5 minutes, 30 minutes, 2 hours, and 12
hours. Delivery stops after six attempts.

Veyra revalidates DNS before every delivery, pins the validated public address,
blocks redirects and private/link-local/metadata networks, limits the response
body, and uses an eight-second timeout. Delivery history never stores response
bodies, authorization headers, secrets, socket errors, or stack traces.
