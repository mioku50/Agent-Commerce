// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.25;

import {AgentCommerceProofRegistry} from "../src/AgentCommerceProofRegistry.sol";

interface Vm {
    function expectEmit(bool, bool, bool, bool, address) external;
    function expectRevert(bytes calldata) external;
    function prank(address) external;
    function warp(uint256) external;
}

contract AgentCommerceProofRegistryTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant OPERATOR = address(0xA11CE);
    address private constant ATTESTER = address(0xA77357);
    address private constant BUYER = address(0xB0B);
    address private constant SELLER = address(0x5E11E2);
    address private constant UNAUTHORIZED = address(0xBAD);

    bytes32 private constant RECEIPT_ID = keccak256("receipt-1");
    bytes32 private constant SERVICE_HASH = keccak256("service-1");
    bytes32 private constant REQUEST_HASH = keccak256("request-1");
    bytes32 private constant RESPONSE_HASH = keccak256("response-1");
    uint256 private constant AMOUNT = 1_000;
    uint64 private constant TIMESTAMP = 1_800_000_000;

    AgentCommerceProofRegistry private registry;

    event ProofRegistered(
        bytes32 indexed receiptId,
        bytes32 indexed serviceHash,
        address indexed buyer,
        address seller,
        uint256 amount,
        bytes32 requestHash,
        bytes32 responseHash,
        uint64 timestamp,
        address attester
    );
    event AttesterUpdated(address indexed attester, bool authorized);

    function setUp() public {
        registry = new AgentCommerceProofRegistry(OPERATOR, ATTESTER);
        vm.warp(TIMESTAMP);
    }

    function testAttesterRegistersProof() public {
        vm.prank(ATTESTER);
        registry.registerProof(RECEIPT_ID, SERVICE_HASH, BUYER, SELLER, AMOUNT, REQUEST_HASH, RESPONSE_HASH);

        (
            bytes32 serviceHash,
            address buyer,
            address seller,
            uint256 amount,
            bytes32 requestHash,
            bytes32 responseHash,
            uint64 timestamp
        ) = registry.getProof(RECEIPT_ID);

        assertEq(serviceHash, SERVICE_HASH);
        assertEq(buyer, BUYER);
        assertEq(seller, SELLER);
        assertEq(amount, AMOUNT);
        assertEq(requestHash, REQUEST_HASH);
        assertEq(responseHash, RESPONSE_HASH);
        assertEqUint64(timestamp, TIMESTAMP);
        assertTrue(registry.isRegistered(RECEIPT_ID));
    }

    function testRejectsDuplicateReceipt() public {
        vm.prank(ATTESTER);
        registry.registerProof(RECEIPT_ID, SERVICE_HASH, BUYER, SELLER, AMOUNT, REQUEST_HASH, RESPONSE_HASH);

        vm.expectRevert(abi.encodeWithSelector(AgentCommerceProofRegistry.DuplicateReceipt.selector, RECEIPT_ID));
        vm.prank(ATTESTER);
        registry.registerProof(RECEIPT_ID, SERVICE_HASH, BUYER, SELLER, AMOUNT, REQUEST_HASH, RESPONSE_HASH);
    }

    function testRejectsUnauthorizedWriter() public {
        vm.expectRevert(abi.encodeWithSelector(AgentCommerceProofRegistry.UnauthorizedWriter.selector, UNAUTHORIZED));
        vm.prank(UNAUTHORIZED);
        registry.registerProof(RECEIPT_ID, SERVICE_HASH, BUYER, SELLER, AMOUNT, REQUEST_HASH, RESPONSE_HASH);
    }

    function testEmitsProofRegisteredEvent() public {
        vm.expectEmit(true, true, true, true, address(registry));
        emit ProofRegistered(
            RECEIPT_ID, SERVICE_HASH, BUYER, SELLER, AMOUNT, REQUEST_HASH, RESPONSE_HASH, TIMESTAMP, ATTESTER
        );

        vm.prank(ATTESTER);
        registry.registerProof(RECEIPT_ID, SERVICE_HASH, BUYER, SELLER, AMOUNT, REQUEST_HASH, RESPONSE_HASH);
    }

    function testOperatorUpdatesAttesterAndEmitsEvent() public {
        address nextAttester = address(0xA77E57);

        vm.expectEmit(true, false, false, true, address(registry));
        emit AttesterUpdated(nextAttester, true);

        vm.prank(OPERATOR);
        registry.setAttester(nextAttester, true);

        assertTrue(registry.isAttester(nextAttester));
    }

    function assertEq(bytes32 actual, bytes32 expected) private pure {
        require(actual == expected, "bytes32 values differ");
    }

    function assertEq(address actual, address expected) private pure {
        require(actual == expected, "addresses differ");
    }

    function assertEq(uint256 actual, uint256 expected) private pure {
        require(actual == expected, "uint256 values differ");
    }

    function assertEqUint64(uint64 actual, uint64 expected) private pure {
        require(actual == expected, "uint64 values differ");
    }

    function assertTrue(bool value) private pure {
        require(value, "value is not true");
    }
}
