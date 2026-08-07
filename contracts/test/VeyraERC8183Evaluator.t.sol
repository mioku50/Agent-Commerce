// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.25;

import {VeyraERC8183Evaluator} from "../src/VeyraERC8183Evaluator.sol";
import {IERC8183AgenticCommerce} from "../src/interfaces/IERC8183AgenticCommerce.sol";
import {MockERC8183AgenticCommerce} from "./mocks/MockERC8183AgenticCommerce.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface Vm {
    function expectEmit(bool, bool, bool, bool) external;
    function expectEmit(bool, bool, bool, bool, address) external;
    function expectRevert(bytes calldata) external;
    function expectRevert(bytes4) external;
    function expectRevert() external;
    function prank(address) external;
    function warp(uint256) external;
    function addr(uint256) external pure returns (address);
    function sign(uint256, bytes32) external pure returns (uint8 v, bytes32 r, bytes32 s);
}

contract MockToken is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {
        _mint(msg.sender, 1_000_000 * 1e6);
    }
}

contract VeyraERC8183EvaluatorTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 public constant SUPPORTED_POLICY_HASH = keccak256("structured-deliverable-v1");

    VeyraERC8183Evaluator public evaluator;
    MockERC8183AgenticCommerce public commerce;
    MockToken public token;

    uint256 public adminPrivateKey = 0xA11CE;
    address public admin;

    uint256 public attesterPrivateKey = 0xB0B;
    address public attester;

    uint256 public wrongPrivateKey = 0xBAD;
    address public wrongSigner;

    address public relayer = address(0x999);
    address public client = address(0x111);
    address public provider = address(0x222);

    uint256 public jobId;

    event EvaluationExecuted(
        address indexed agenticCommerce,
        uint256 indexed jobId,
        bytes32 indexed reportHash,
        bytes32 deliverableHash,
        bytes32 policyHash,
        VeyraERC8183Evaluator.Decision decision,
        address attester,
        address relayer
    );

    function setUp() public {
        vm.warp(1_800_000_000);
        admin = vm.addr(adminPrivateKey);
        attester = vm.addr(attesterPrivateKey);
        wrongSigner = vm.addr(wrongPrivateKey);

        commerce = new MockERC8183AgenticCommerce();
        token = new MockToken();

        evaluator = new VeyraERC8183Evaluator(
            admin,
            attester,
            address(commerce),
            SUPPORTED_POLICY_HASH
        );

        // Client creates job targeting evaluator
        vm.prank(client);
        jobId = commerce.createJob(
            provider,
            address(evaluator),
            5_000_000,
            uint64(block.timestamp + 3600),
            "Test market brief"
        );

        // Provider submits deliverable
        vm.prank(provider);
        commerce.submit(jobId, keccak256("deliverable-v1"));
    }

    function _signVerdict(
        VeyraERC8183Evaluator.Verdict memory verdict,
        uint256 pk,
        address verifyingContract,
        uint256 chainId
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                evaluator.VERDICT_TYPEHASH(),
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

        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("Veyra ERC8183 Evaluator")),
                keccak256(bytes("1")),
                chainId,
                verifyingContract
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function testValidCompleteVerdict() public {
        VeyraERC8183Evaluator.Verdict memory verdict = VeyraERC8183Evaluator.Verdict({
            agenticCommerce: address(commerce),
            jobId: jobId,
            deliverableHash: keccak256("deliverable-v1"),
            reportHash: keccak256("canonical-report-v1"),
            policyHash: SUPPORTED_POLICY_HASH,
            decision: VeyraERC8183Evaluator.Decision.Complete,
            evaluatedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 300),
            nonce: 1
        });

        bytes memory sig = _signVerdict(verdict, attesterPrivateKey, address(evaluator), block.chainid);

        vm.prank(relayer);
        vm.expectEmit(true, true, true, true);
        emit EvaluationExecuted(
            address(commerce),
            jobId,
            verdict.reportHash,
            verdict.deliverableHash,
            verdict.policyHash,
            VeyraERC8183Evaluator.Decision.Complete,
            attester,
            relayer
        );
        evaluator.executeVerdict(verdict, sig);

        IERC8183AgenticCommerce.Job memory job = commerce.getJob(jobId);
        assertEq(uint8(job.status), uint8(IERC8183AgenticCommerce.Status.Completed));
        assertTrue(evaluator.resolvedJobs(address(commerce), jobId));
    }

    function testValidRejectVerdict() public {
        VeyraERC8183Evaluator.Verdict memory verdict = VeyraERC8183Evaluator.Verdict({
            agenticCommerce: address(commerce),
            jobId: jobId,
            deliverableHash: keccak256("deliverable-v1"),
            reportHash: keccak256("canonical-report-reject"),
            policyHash: SUPPORTED_POLICY_HASH,
            decision: VeyraERC8183Evaluator.Decision.Reject,
            evaluatedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 300),
            nonce: 2
        });

        bytes memory sig = _signVerdict(verdict, attesterPrivateKey, address(evaluator), block.chainid);

        vm.prank(relayer);
        evaluator.executeVerdict(verdict, sig);

        IERC8183AgenticCommerce.Job memory job = commerce.getJob(jobId);
        assertEq(uint8(job.status), uint8(IERC8183AgenticCommerce.Status.Rejected));
        assertTrue(evaluator.resolvedJobs(address(commerce), jobId));
    }

    function testRejectsWrongSigner() public {
        VeyraERC8183Evaluator.Verdict memory verdict = VeyraERC8183Evaluator.Verdict({
            agenticCommerce: address(commerce),
            jobId: jobId,
            deliverableHash: keccak256("deliverable-v1"),
            reportHash: keccak256("report-v1"),
            policyHash: SUPPORTED_POLICY_HASH,
            decision: VeyraERC8183Evaluator.Decision.Complete,
            evaluatedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 300),
            nonce: 1
        });

        bytes memory sig = _signVerdict(verdict, wrongPrivateKey, address(evaluator), block.chainid);

        vm.expectRevert(abi.encodeWithSelector(VeyraERC8183Evaluator.UnauthorizedAttester.selector, wrongSigner));
        evaluator.executeVerdict(verdict, sig);
    }

    function testRejectsExpiredVerdict() public {
        VeyraERC8183Evaluator.Verdict memory verdict = VeyraERC8183Evaluator.Verdict({
            agenticCommerce: address(commerce),
            jobId: jobId,
            deliverableHash: keccak256("deliverable-v1"),
            reportHash: keccak256("report-v1"),
            policyHash: SUPPORTED_POLICY_HASH,
            decision: VeyraERC8183Evaluator.Decision.Complete,
            evaluatedAt: uint64(block.timestamp - 500),
            validUntil: uint64(block.timestamp - 1),
            nonce: 1
        });

        bytes memory sig = _signVerdict(verdict, attesterPrivateKey, address(evaluator), block.chainid);

        vm.expectRevert(
            abi.encodeWithSelector(
                VeyraERC8183Evaluator.VerdictExpired.selector,
                verdict.validUntil,
                uint64(block.timestamp)
            )
        );
        evaluator.executeVerdict(verdict, sig);
    }

    function testRejectsWrongChainOrDomain() public {
        VeyraERC8183Evaluator.Verdict memory verdict = VeyraERC8183Evaluator.Verdict({
            agenticCommerce: address(commerce),
            jobId: jobId,
            deliverableHash: keccak256("deliverable-v1"),
            reportHash: keccak256("report-v1"),
            policyHash: SUPPORTED_POLICY_HASH,
            decision: VeyraERC8183Evaluator.Decision.Complete,
            evaluatedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 300),
            nonce: 1
        });

        // Signed for chain 1 instead of block.chainid
        bytes memory sig = _signVerdict(verdict, attesterPrivateKey, address(evaluator), 1);

        vm.expectRevert();
        evaluator.executeVerdict(verdict, sig);
    }

    function testRejectsWrongERC8183Contract() public {
        MockERC8183AgenticCommerce unapproved = new MockERC8183AgenticCommerce();

        VeyraERC8183Evaluator.Verdict memory verdict = VeyraERC8183Evaluator.Verdict({
            agenticCommerce: address(unapproved),
            jobId: jobId,
            deliverableHash: keccak256("deliverable-v1"),
            reportHash: keccak256("report-v1"),
            policyHash: SUPPORTED_POLICY_HASH,
            decision: VeyraERC8183Evaluator.Decision.Complete,
            evaluatedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 300),
            nonce: 1
        });

        bytes memory sig = _signVerdict(verdict, attesterPrivateKey, address(evaluator), block.chainid);

        vm.expectRevert(abi.encodeWithSelector(VeyraERC8183Evaluator.UnsupportedCommerce.selector, address(unapproved)));
        evaluator.executeVerdict(verdict, sig);
    }

    function testRejectsUnsupportedPolicyHash() public {
        bytes32 wrongPolicy = keccak256("unsupported-policy");

        VeyraERC8183Evaluator.Verdict memory verdict = VeyraERC8183Evaluator.Verdict({
            agenticCommerce: address(commerce),
            jobId: jobId,
            deliverableHash: keccak256("deliverable-v1"),
            reportHash: keccak256("report-v1"),
            policyHash: wrongPolicy,
            decision: VeyraERC8183Evaluator.Decision.Complete,
            evaluatedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 300),
            nonce: 1
        });

        bytes memory sig = _signVerdict(verdict, attesterPrivateKey, address(evaluator), block.chainid);

        vm.expectRevert(abi.encodeWithSelector(VeyraERC8183Evaluator.UnsupportedPolicy.selector, wrongPolicy));
        evaluator.executeVerdict(verdict, sig);
    }

    function testRejectsZeroReportHash() public {
        VeyraERC8183Evaluator.Verdict memory verdict = VeyraERC8183Evaluator.Verdict({
            agenticCommerce: address(commerce),
            jobId: jobId,
            deliverableHash: keccak256("deliverable-v1"),
            reportHash: bytes32(0),
            policyHash: SUPPORTED_POLICY_HASH,
            decision: VeyraERC8183Evaluator.Decision.Complete,
            evaluatedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 300),
            nonce: 1
        });

        bytes memory sig = _signVerdict(verdict, attesterPrivateKey, address(evaluator), block.chainid);

        vm.expectRevert(VeyraERC8183Evaluator.ZeroHash.selector);
        evaluator.executeVerdict(verdict, sig);
    }

    function testRejectsReplaySignature() public {
        VeyraERC8183Evaluator.Verdict memory verdict = VeyraERC8183Evaluator.Verdict({
            agenticCommerce: address(commerce),
            jobId: jobId,
            deliverableHash: keccak256("deliverable-v1"),
            reportHash: keccak256("report-v1"),
            policyHash: SUPPORTED_POLICY_HASH,
            decision: VeyraERC8183Evaluator.Decision.Complete,
            evaluatedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 300),
            nonce: 1
        });

        bytes memory sig = _signVerdict(verdict, attesterPrivateKey, address(evaluator), block.chainid);

        evaluator.executeVerdict(verdict, sig);

        vm.expectRevert();
        evaluator.executeVerdict(verdict, sig);
    }

    function testRejectsSecondVerdictForSameJob() public {
        VeyraERC8183Evaluator.Verdict memory verdict1 = VeyraERC8183Evaluator.Verdict({
            agenticCommerce: address(commerce),
            jobId: jobId,
            deliverableHash: keccak256("deliverable-v1"),
            reportHash: keccak256("report-v1"),
            policyHash: SUPPORTED_POLICY_HASH,
            decision: VeyraERC8183Evaluator.Decision.Complete,
            evaluatedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 300),
            nonce: 1
        });
        bytes memory sig1 = _signVerdict(verdict1, attesterPrivateKey, address(evaluator), block.chainid);
        evaluator.executeVerdict(verdict1, sig1);

        VeyraERC8183Evaluator.Verdict memory verdict2 = VeyraERC8183Evaluator.Verdict({
            agenticCommerce: address(commerce),
            jobId: jobId,
            deliverableHash: keccak256("deliverable-v1"),
            reportHash: keccak256("report-v2"),
            policyHash: SUPPORTED_POLICY_HASH,
            decision: VeyraERC8183Evaluator.Decision.Reject,
            evaluatedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 300),
            nonce: 2
        });
        bytes memory sig2 = _signVerdict(verdict2, attesterPrivateKey, address(evaluator), block.chainid);

        vm.expectRevert(
            abi.encodeWithSelector(
                VeyraERC8183Evaluator.JobAlreadyResolved.selector,
                address(commerce),
                jobId
            )
        );
        evaluator.executeVerdict(verdict2, sig2);
    }

    function testRejectsEvaluatorMismatch() public {
        address otherEvaluator = address(0x777);
        commerce.setJobEvaluator(jobId, otherEvaluator);

        VeyraERC8183Evaluator.Verdict memory verdict = VeyraERC8183Evaluator.Verdict({
            agenticCommerce: address(commerce),
            jobId: jobId,
            deliverableHash: keccak256("deliverable-v1"),
            reportHash: keccak256("report-v1"),
            policyHash: SUPPORTED_POLICY_HASH,
            decision: VeyraERC8183Evaluator.Decision.Complete,
            evaluatedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 300),
            nonce: 1
        });
        bytes memory sig = _signVerdict(verdict, attesterPrivateKey, address(evaluator), block.chainid);

        vm.expectRevert("Only evaluator can complete");
        evaluator.executeVerdict(verdict, sig);
    }

    function testRejectsNonSubmittedJob() public {
        commerce.setJobStatus(jobId, IERC8183AgenticCommerce.Status.Open);

        VeyraERC8183Evaluator.Verdict memory verdict = VeyraERC8183Evaluator.Verdict({
            agenticCommerce: address(commerce),
            jobId: jobId,
            deliverableHash: keccak256("deliverable-v1"),
            reportHash: keccak256("report-v1"),
            policyHash: SUPPORTED_POLICY_HASH,
            decision: VeyraERC8183Evaluator.Decision.Complete,
            evaluatedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 300),
            nonce: 1
        });
        bytes memory sig = _signVerdict(verdict, attesterPrivateKey, address(evaluator), block.chainid);

        vm.expectRevert("Job not submitted");
        evaluator.executeVerdict(verdict, sig);
    }

    function testRejectsPausedContract() public {
        vm.prank(admin);
        evaluator.pause();

        VeyraERC8183Evaluator.Verdict memory verdict = VeyraERC8183Evaluator.Verdict({
            agenticCommerce: address(commerce),
            jobId: jobId,
            deliverableHash: keccak256("deliverable-v1"),
            reportHash: keccak256("report-v1"),
            policyHash: SUPPORTED_POLICY_HASH,
            decision: VeyraERC8183Evaluator.Decision.Complete,
            evaluatedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 300),
            nonce: 1
        });
        bytes memory sig = _signVerdict(verdict, attesterPrivateKey, address(evaluator), block.chainid);

        vm.expectRevert();
        evaluator.executeVerdict(verdict, sig);
    }

    function testArbitraryRelayerWithValidSignature() public {
        address strangerRelayer = address(0xDEF);

        VeyraERC8183Evaluator.Verdict memory verdict = VeyraERC8183Evaluator.Verdict({
            agenticCommerce: address(commerce),
            jobId: jobId,
            deliverableHash: keccak256("deliverable-v1"),
            reportHash: keccak256("report-v1"),
            policyHash: SUPPORTED_POLICY_HASH,
            decision: VeyraERC8183Evaluator.Decision.Complete,
            evaluatedAt: uint64(block.timestamp),
            validUntil: uint64(block.timestamp + 300),
            nonce: 1
        });
        bytes memory sig = _signVerdict(verdict, attesterPrivateKey, address(evaluator), block.chainid);

        vm.prank(strangerRelayer);
        evaluator.executeVerdict(verdict, sig);

        IERC8183AgenticCommerce.Job memory job = commerce.getJob(jobId);
        assertEq(uint8(job.status), uint8(IERC8183AgenticCommerce.Status.Completed));
    }

    function testTokenWithdrawalAccessControl() public {
        // Transfer 100 USDC to evaluator contract
        token.transfer(address(evaluator), 100 * 1e6);
        assertEq(token.balanceOf(address(evaluator)), 100 * 1e6);

        // Non-admin attempt fails
        vm.prank(relayer);
        vm.expectRevert();
        evaluator.emergencyWithdrawERC20(IERC20(address(token)), relayer, 100 * 1e6);

        // Admin withdraws successfully
        address vault = address(0x888);
        vm.prank(admin);
        evaluator.emergencyWithdrawERC20(IERC20(address(token)), vault, 100 * 1e6);

        assertEq(token.balanceOf(address(evaluator)), 0);
        assertEq(token.balanceOf(vault), 100 * 1e6);
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

    function assertTrue(bool value) private pure {
        require(value, "value is not true");
    }
}
