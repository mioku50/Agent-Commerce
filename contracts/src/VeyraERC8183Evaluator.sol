// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.25;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC8183AgenticCommerce} from "./interfaces/IERC8183AgenticCommerce.sol";

/// @title VeyraERC8183Evaluator
/// @notice Non-upgradeable evaluator contract for ERC-8183 jobs on Arc Testnet.
/// @dev Verifies EIP-712 attestation verdicts and executes complete() or reject().
contract VeyraERC8183Evaluator is EIP712, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ATTESTER_ROLE = keccak256("ATTESTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint64 public constant MAX_VERDICT_VALIDITY_SECONDS = 600; // 10 minutes max validity

    bytes32 public constant VERDICT_TYPEHASH = keccak256(
        "Verdict(address agenticCommerce,uint256 jobId,bytes32 deliverableHash,bytes32 reportHash,bytes32 policyHash,uint8 decision,uint64 evaluatedAt,uint64 validUntil,uint256 nonce)"
    );

    enum Decision {
        None,
        Complete,
        Reject
    }

    struct Verdict {
        address agenticCommerce;
        uint256 jobId;
        bytes32 deliverableHash;
        bytes32 reportHash;
        bytes32 policyHash;
        Decision decision;
        uint64 evaluatedAt;
        uint64 validUntil;
        uint256 nonce;
    }

    bytes32 public immutable SUPPORTED_POLICY_HASH;

    mapping(address commerce => bool supported) public supportedCommerce;
    mapping(bytes32 digest => bool executed) public executedDigests;
    mapping(address commerce => mapping(uint256 jobId => bool resolved)) public resolvedJobs;

    event EvaluationExecuted(
        address indexed agenticCommerce,
        uint256 indexed jobId,
        bytes32 indexed reportHash,
        bytes32 deliverableHash,
        bytes32 policyHash,
        Decision decision,
        address attester,
        address relayer
    );

    event AttesterUpdated(address indexed attester, bool active);
    event SupportedCommerceUpdated(address indexed commerce, bool active);

    error ContractPaused();
    error UnsupportedCommerce(address commerce);
    error VerdictExpired(uint64 validUntil, uint64 currentTimestamp);
    error ValidityTooLong(uint64 validUntil, uint64 maxAllowed);
    error UnsupportedPolicy(bytes32 policyHash);
    error ZeroHash();
    error InvalidDecision(Decision decision);
    error DigestAlreadyExecuted(bytes32 digest);
    error UnauthorizedAttester(address signer);
    error JobAlreadyResolved(address commerce, uint256 jobId);
    error JobNotSubmitted(IERC8183AgenticCommerce.Status status);
    error EvaluatorMismatch(address expected, address actual);
    error ZeroAddress();

    constructor(
        address initialAdmin,
        address initialAttester,
        address initialCommerce,
        bytes32 supportedPolicyHash
    ) EIP712("Veyra ERC8183 Evaluator", "1") {
        if (initialAdmin == address(0) || initialAttester == address(0) || initialCommerce == address(0)) {
            revert ZeroAddress();
        }
        if (supportedPolicyHash == bytes32(0)) {
            revert ZeroHash();
        }

        SUPPORTED_POLICY_HASH = supportedPolicyHash;

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _grantRole(PAUSER_ROLE, initialAdmin);
        _grantRole(ATTESTER_ROLE, initialAttester);

        supportedCommerce[initialCommerce] = true;

        emit AttesterUpdated(initialAttester, true);
        emit SupportedCommerceUpdated(initialCommerce, true);
    }

    function setSupportedCommerce(address commerce, bool active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (commerce == address(0)) revert ZeroAddress();
        supportedCommerce[commerce] = active;
        emit SupportedCommerceUpdated(commerce, active);
    }

    function setAttester(address attester, bool active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (attester == address(0)) revert ZeroAddress();
        if (active) {
            _grantRole(ATTESTER_ROLE, attester);
        } else {
            _revokeRole(ATTESTER_ROLE, attester);
        }
        emit AttesterUpdated(attester, active);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function hashVerdict(Verdict calldata verdict) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                VERDICT_TYPEHASH,
                verdict.agenticCommerce,
                verdict.jobId,
                verdict.deliverableHash,
                verdict.reportHash,
                verdict.policyHash,
                uint8(verdict.decision),
                verdict.evaluatedAt,
                verdict.validUntil,
                verdict.nonce
            )
        );
        return _hashTypedDataV4(structHash);
    }

    function executeVerdict(Verdict calldata verdict, bytes calldata signature) external whenNotPaused nonReentrant {
        if (!supportedCommerce[verdict.agenticCommerce]) {
            revert UnsupportedCommerce(verdict.agenticCommerce);
        }
        if (verdict.validUntil < block.timestamp) {
            revert VerdictExpired(verdict.validUntil, uint64(block.timestamp));
        }
        if (verdict.validUntil > block.timestamp + MAX_VERDICT_VALIDITY_SECONDS) {
            revert ValidityTooLong(verdict.validUntil, uint64(block.timestamp + MAX_VERDICT_VALIDITY_SECONDS));
        }
        if (verdict.policyHash != SUPPORTED_POLICY_HASH) {
            revert UnsupportedPolicy(verdict.policyHash);
        }
        if (verdict.reportHash == bytes32(0) || verdict.deliverableHash == bytes32(0)) {
            revert ZeroHash();
        }
        if (verdict.decision != Decision.Complete && verdict.decision != Decision.Reject) {
            revert InvalidDecision(verdict.decision);
        }

        bytes32 digest = hashVerdict(verdict);
        if (executedDigests[digest]) {
            revert DigestAlreadyExecuted(digest);
        }

        address signer = ECDSA.recover(digest, signature);
        if (!hasRole(ATTESTER_ROLE, signer)) {
            revert UnauthorizedAttester(signer);
        }

        if (resolvedJobs[verdict.agenticCommerce][verdict.jobId]) {
            revert JobAlreadyResolved(verdict.agenticCommerce, verdict.jobId);
        }

        // Checks-Effects-Interactions pattern: set state BEFORE external calls
        executedDigests[digest] = true;
        resolvedJobs[verdict.agenticCommerce][verdict.jobId] = true;

        bytes memory optParams = abi.encode(verdict.deliverableHash, verdict.policyHash, uint16(1));

        IERC8183AgenticCommerce commerceContract = IERC8183AgenticCommerce(verdict.agenticCommerce);

        if (verdict.decision == Decision.Complete) {
            commerceContract.complete(verdict.jobId, verdict.reportHash, optParams);
        } else {
            commerceContract.reject(verdict.jobId, verdict.reportHash, optParams);
        }

        emit EvaluationExecuted(
            verdict.agenticCommerce,
            verdict.jobId,
            verdict.reportHash,
            verdict.deliverableHash,
            verdict.policyHash,
            verdict.decision,
            signer,
            msg.sender
        );
    }

    function emergencyWithdrawERC20(IERC20 token, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        token.safeTransfer(to, amount);
    }

    function emergencyWithdrawNative(address payable to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        (bool success, ) = to.call{value: amount}("");
        require(success, "Native transfer failed");
    }

    receive() external payable {}
}
