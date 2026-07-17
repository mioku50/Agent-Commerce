// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.25;

/// @title Agent Commerce Proof Registry
/// @notice Stores compact, immutable proofs for successfully settled x402 calls.
/// @dev This contract never receives funds and is independent from Circle Gateway.
contract AgentCommerceProofRegistry {
    struct Proof {
        bytes32 serviceHash;
        address buyer;
        address seller;
        uint256 amount;
        bytes32 requestHash;
        bytes32 responseHash;
        uint64 timestamp;
    }

    error DuplicateReceipt(bytes32 receiptId);
    error InvalidAmount();
    error InvalidHash();
    error UnauthorizedWriter(address caller);
    error ZeroAddress();

    event AttesterUpdated(address indexed attester, bool authorized);
    event OperatorTransferred(address indexed previousOperator, address indexed newOperator);
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

    address public operator;
    mapping(address attester => bool authorized) public isAttester;
    mapping(bytes32 receiptId => Proof proof) private proofs;

    modifier onlyOperator() {
        if (msg.sender != operator) revert UnauthorizedWriter(msg.sender);
        _;
    }

    modifier onlyWriter() {
        if (msg.sender != operator && !isAttester[msg.sender]) {
            revert UnauthorizedWriter(msg.sender);
        }
        _;
    }

    constructor(address initialOperator, address initialAttester) {
        if (initialOperator == address(0) || initialAttester == address(0)) {
            revert ZeroAddress();
        }

        operator = initialOperator;
        isAttester[initialAttester] = true;

        emit OperatorTransferred(address(0), initialOperator);
        emit AttesterUpdated(initialAttester, true);
    }

    function setAttester(address attester, bool authorized) external onlyOperator {
        if (attester == address(0)) revert ZeroAddress();

        isAttester[attester] = authorized;
        emit AttesterUpdated(attester, authorized);
    }

    function transferOperator(address newOperator) external onlyOperator {
        if (newOperator == address(0)) revert ZeroAddress();

        address previousOperator = operator;
        operator = newOperator;
        emit OperatorTransferred(previousOperator, newOperator);
    }

    function registerProof(
        bytes32 receiptId,
        bytes32 serviceHash,
        address buyer,
        address seller,
        uint256 amount,
        bytes32 requestHash,
        bytes32 responseHash
    ) external onlyWriter returns (uint64 timestamp) {
        if (proofs[receiptId].timestamp != 0) revert DuplicateReceipt(receiptId);
        if (
            receiptId == bytes32(0) || serviceHash == bytes32(0) || requestHash == bytes32(0)
                || responseHash == bytes32(0)
        ) revert InvalidHash();
        if (buyer == address(0) || seller == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();

        timestamp = uint64(block.timestamp);
        proofs[receiptId] = Proof({
            serviceHash: serviceHash,
            buyer: buyer,
            seller: seller,
            amount: amount,
            requestHash: requestHash,
            responseHash: responseHash,
            timestamp: timestamp
        });

        emit ProofRegistered(
            receiptId, serviceHash, buyer, seller, amount, requestHash, responseHash, timestamp, msg.sender
        );
    }

    function isRegistered(bytes32 receiptId) external view returns (bool) {
        return proofs[receiptId].timestamp != 0;
    }

    function getProof(bytes32 receiptId)
        external
        view
        returns (
            bytes32 serviceHash,
            address buyer,
            address seller,
            uint256 amount,
            bytes32 requestHash,
            bytes32 responseHash,
            uint64 timestamp
        )
    {
        Proof storage proof = proofs[receiptId];
        return (
            proof.serviceHash,
            proof.buyer,
            proof.seller,
            proof.amount,
            proof.requestHash,
            proof.responseHash,
            proof.timestamp
        );
    }
}
