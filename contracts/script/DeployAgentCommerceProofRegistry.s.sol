// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.25;

import {AgentCommerceProofRegistry} from "../src/AgentCommerceProofRegistry.sol";

interface Vm {
    function envAddress(string calldata name) external returns (address value);
    function startBroadcast() external;
    function stopBroadcast() external;
}

/// @notice Deploy with an encrypted Foundry keystore account; never pass a key on the CLI.
contract DeployAgentCommerceProofRegistry {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (AgentCommerceProofRegistry registry) {
        address operator = vm.envAddress("PROOF_REGISTRY_OPERATOR_ADDRESS");
        address attester = vm.envAddress("PROOF_REGISTRY_ATTESTER_ADDRESS");

        vm.startBroadcast();
        registry = new AgentCommerceProofRegistry(operator, attester);
        vm.stopBroadcast();
    }
}
