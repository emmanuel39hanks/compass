// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {ValidationRegistry} from "../src/ValidationRegistry.sol";

contract ReputationRegistryTest is Test {
    ReputationRegistry rep;
    ValidationRegistry val;
    address clientA = address(0xA);
    address clientB = address(0xB);
    address validator = address(0x5);

    function setUp() public {
        rep = new ReputationRegistry();
        val = new ValidationRegistry();
    }

    function test_giveFeedback_aggregatesAverage() public {
        bytes32 zero = bytes32(0);
        vm.prank(clientA);
        rep.giveFeedback(7, 90, 0, "", "", "", "", zero);
        vm.prank(clientB);
        rep.giveFeedback(7, 80, 0, "", "", "", "", zero);

        (uint64 count, int128 summaryValue, uint8 decimals) = rep.getSummary(7, new address[](0), "", "");
        assertEq(count, 2);
        assertEq(summaryValue, 85); // (90 + 80) / 2
        assertEq(decimals, 0);
    }

    function test_revoke_excludesFromSummary() public {
        vm.startPrank(clientA);
        rep.giveFeedback(7, 100, 0, "", "", "", "", bytes32(0));
        rep.revokeFeedback(7, 0);
        vm.stopPrank();

        (uint64 count,,) = rep.getSummary(7, new address[](0), "", "");
        assertEq(count, 0);
    }

    function test_validation_requestRespondSummary() public {
        bytes32 reqHash = keccak256("task-1");
        val.validationRequest(validator, 7, "ipfs://req", reqHash);
        vm.prank(validator);
        val.validationResponse(reqHash, 95, "ipfs://res", bytes32(0), "");

        (uint64 count, uint8 avg) = val.getSummary(7, new address[](0), "");
        assertEq(count, 1);
        assertEq(avg, 95);
    }

    function test_validation_onlyValidatorResponds() public {
        bytes32 reqHash = keccak256("task-2");
        val.validationRequest(validator, 7, "ipfs://req", reqHash);
        vm.expectRevert();
        val.validationResponse(reqHash, 50, "", bytes32(0), "");
    }
}
