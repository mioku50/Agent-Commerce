// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.25;

import {IERC8183AgenticCommerce} from "../../src/interfaces/IERC8183AgenticCommerce.sol";

contract MockERC8183AgenticCommerce is IERC8183AgenticCommerce {
    uint256 public nextJobId = 1;
    mapping(uint256 => Job) public jobsMap;

    function createJob(
        address provider,
        address evaluator,
        uint256 budget,
        uint64 expiredAt,
        string calldata description
    ) external override returns (uint256 jobId) {
        jobId = nextJobId++;
        jobsMap[jobId] = Job({
            jobId: jobId,
            client: msg.sender,
            provider: provider,
            evaluator: evaluator,
            budget: budget,
            expiredAt: expiredAt,
            status: Status.Open,
            description: description
        });

        emit JobCreated(jobId, msg.sender, provider, evaluator, budget, expiredAt, description);
    }

    function submit(uint256 jobId, bytes32 deliverableHash) external override {
        Job storage job = jobsMap[jobId];
        require(job.jobId != 0, "Job does not exist");
        require(job.status == Status.Open, "Job not open");
        job.status = Status.Submitted;
        emit JobSubmitted(jobId, deliverableHash);
    }

    function complete(uint256 jobId, bytes32 reason, bytes calldata optParams) external override {
        Job storage job = jobsMap[jobId];
        require(job.jobId != 0, "Job does not exist");
        require(job.status == Status.Submitted, "Job not submitted");
        require(msg.sender == job.evaluator, "Only evaluator can complete");
        job.status = Status.Completed;
        emit JobCompleted(jobId, reason, optParams);
    }

    function reject(uint256 jobId, bytes32 reason, bytes calldata optParams) external override {
        Job storage job = jobsMap[jobId];
        require(job.jobId != 0, "Job does not exist");
        require(job.status == Status.Submitted, "Job not submitted");
        require(msg.sender == job.evaluator, "Only evaluator can reject");
        job.status = Status.Rejected;
        emit JobRejected(jobId, reason, optParams);
    }

    function setJobStatus(uint256 jobId, Status status) external {
        jobsMap[jobId].status = status;
    }

    function setJobEvaluator(uint256 jobId, address evaluator) external {
        jobsMap[jobId].evaluator = evaluator;
    }

    function getJob(uint256 jobId) external view override returns (Job memory) {
        return jobsMap[jobId];
    }
}
