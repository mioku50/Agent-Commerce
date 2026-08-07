// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.25;

import {IERC8183AgenticCommerce} from "../src/interfaces/IERC8183AgenticCommerce.sol";

contract IERC8183AgenticCommerceTest {
    function testAbiSelectors() public pure {
        require(IERC8183AgenticCommerce.createJob.selector == bytes4(keccak256("createJob(address,address,uint256,uint64,string)")), "createJob selector mismatch");
        require(IERC8183AgenticCommerce.submit.selector == bytes4(keccak256("submit(uint256,bytes32)")), "submit selector mismatch");
        require(IERC8183AgenticCommerce.complete.selector == bytes4(keccak256("complete(uint256,bytes32,bytes)")), "complete selector mismatch");
        require(IERC8183AgenticCommerce.reject.selector == bytes4(keccak256("reject(uint256,bytes32,bytes)")), "reject selector mismatch");
        require(IERC8183AgenticCommerce.getJob.selector == bytes4(keccak256("getJob(uint256)")), "getJob selector mismatch");
    }
}
