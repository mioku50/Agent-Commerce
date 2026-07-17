# Agent Commerce Proof Registry

This isolated Foundry workspace contains the Arc Testnet proof registry used by
the application after a successful x402 settlement. The registry stores compact
proof metadata only; it never receives USDC and does not replace or duplicate
Circle Gateway.

This custom contract is an unaudited Arc Testnet prototype. Review and audit it
before any production use.

## Test

```bash
cd contracts
forge test
```

## Deploy to Arc Testnet

Import a funded Arc Testnet deployer into Foundry's encrypted keystore, then
deploy without placing a private key in shell history:

```bash
cast wallet import arc-proof-deployer --interactive
export ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network
export PROOF_REGISTRY_OPERATOR_ADDRESS=0x...
export PROOF_REGISTRY_ATTESTER_ADDRESS=0x...

forge script script/DeployAgentCommerceProofRegistry.s.sol \
  --rpc-url arc_testnet \
  --account arc-proof-deployer \
  --sender 0xYourDeployerAddress \
  --broadcast
```

The deployer needs Arc Testnet USDC for native gas. After deployment, set
`AGENT_COMMERCE_PROOF_REGISTRY_ADDRESS` in the application environment. The
attester address must correspond to the server-only
`AGENT_COMMERCE_PROOF_ATTESTER_PRIVATE_KEY` secret.
