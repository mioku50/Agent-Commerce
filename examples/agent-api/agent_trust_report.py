#!/usr/bin/env python3
"""Run Veyra Agent Trust Report through the production Machine API."""

import json
import os
import time
import urllib.error
import urllib.request

BASE_URL = os.getenv("VEYRA_API_BASE_URL", "https://agent-commerce-six.vercel.app").rstrip("/")
TOKEN = os.environ["VEYRA_AGENT_API_KEY"]


def call(method, path, body=None, idempotency_key=None):
    headers = {"Authorization": f"Bearer {TOKEN}", "Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    request = urllib.request.Request(
        BASE_URL + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        payload = json.loads(error.read() or b"{}")
        api_error = payload.get("error", {})
        raise RuntimeError(
            f"{api_error.get('code', error.code)}: {api_error.get('message', error.reason)}"
        ) from error


trust_input = {
    "repositoryUrl": os.getenv(
        "VEYRA_TARGET_REPOSITORY",
        "circlefin/developer-controlled-wallets-web-sdk",
    )
}
for env_name, field_name in (
    ("VEYRA_TARGET_AGENT_ID", "agentId"),
    ("VEYRA_TARGET_WALLET", "agentWallet"),
    ("VEYRA_TARGET_CONTRACT", "contractAddress"),
    ("VEYRA_TARGET_ENDPOINT", "serviceEndpoint"),
):
    if os.getenv(env_name):
        trust_input[field_name] = os.environ[env_name]

quote = call(
    "POST",
    "/api/agent/v1/quotes",
    {"workflow": "agent_trust_report", "input": trust_input},
    "agent-trust-python-quote-v1",
)

run_body = {"quoteId": quote["quoteId"]}
payment_hash = os.getenv("VEYRA_ARC_PAYMENT_TX_HASH")
if not quote["sponsored"]:
    if not payment_hash:
        raise RuntimeError(
            f"Send {quote['requiredPayment']['amount']} USDC on Arc Testnet to "
            f"{quote['requiredPayment']['treasuryAddress']}, then set VEYRA_ARC_PAYMENT_TX_HASH."
        )
    run_body["paymentAuthorization"] = {
        "type": "arc_transaction",
        "payload": payment_hash,
    }

run = call("POST", "/api/agent/v1/runs", run_body, "agent-trust-python-run-v1")
while True:
    status = call("GET", f"/api/agent/v1/runs/{run['runId']}")
    if status["status"] in ("completed", "completed_with_warnings", "failed", "expired"):
        break
    time.sleep(max(status.get("pollAfterMs", 2000) / 1000, 0.25))

if not status.get("reportId"):
    raise RuntimeError(f"Run ended as {status['status']} without a report.")
report = call("GET", f"/api/agent/v1/reports/{status['reportId']}")
print(
    json.dumps(
        {
            "reportId": report["reportId"],
            "trustScore": report["trustScore"],
            "verification": report["verification"],
            "questionsBeforeIntegration": report["questionsBeforeIntegration"],
        },
        indent=2,
    )
)
