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

## Arc Testnet deployment

- Contract: [`0x92dC1aFC126F755ba5d5254e8D697CAe10474851`](https://testnet.arcscan.app/address/0x92dC1aFC126F755ba5d5254e8D697CAe10474851)
- Deployment transaction: [`0x7efc6fc86e96781030f79f5ef8e2b1169e8a38b8f9d3395b905cee687bef2ab2`](https://testnet.arcscan.app/tx/0x7efc6fc86e96781030f79f5ef8e2b1169e8a38b8f9d3395b905cee687bef2ab2)
- Deployment block: `52324595`
- Operator: `0x7cE65e573463B83164FFc282a0556D5542defefA`
- Attester: `0x90ceE92dC33647763881DDF830aDFC17217Dfe4A`

The source is verified through Arcscan's Blockscout verifier. These addresses
belong to this proof registry deployment and are not USDC, CCTP, or Gateway
infrastructure addresses.
