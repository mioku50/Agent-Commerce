// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.25;

/// @title IERC8183AgenticCommerce
/// @notice Isolated interface for the ERC-8183 Agentic Commerce contract draft.
interface IERC8183AgenticCommerce {
    enum Status {
        Open,
        Submitted,
        Completed,
        Rejected,
        Expired
    }

    struct Job {
        uint256 jobId;
        address client;
        address provider;
        address evaluator;
        uint256 budget;
        uint64 expiredAt;
        Status status;
        string description;
    }

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed provider,
        address evaluator,
        uint256 budget,
        uint64 expiredAt,
        string description
    );

    event JobSubmitted(
        uint256 indexed jobId,
        bytes32 indexed deliverableHash
    );

    event JobCompleted(
        uint256 indexed jobId,
        bytes32 indexed reason,
        bytes optParams
    );

    event JobRejected(
        uint256 indexed jobId,
        bytes32 indexed reason,
        bytes optParams
    );

    function createJob(
        address provider,
        address evaluator,
        uint256 budget,
        uint64 expiredAt,
        string calldata description
    ) external returns (uint256 jobId);

    function submit(uint256 jobId, bytes32 deliverableHash) external;

    function complete(
        uint256 jobId,
        bytes32 reason,
        bytes calldata optParams
    ) external;

    function reject(
        uint256 jobId,
        bytes32 reason,
        bytes calldata optParams
    ) external;

    function getJob(uint256 jobId) external view returns (Job memory);
}
