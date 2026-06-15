// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CompassAgentRegistry} from "../src/CompassAgentRegistry.sol";

contract CompassAgentRegistryTest is Test {
    CompassAgentRegistry reg;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address agentAccount = address(0xACC0);

    function setUp() public {
        reg = new CompassAgentRegistry();
    }

    function _mint(address owner, string memory name) internal returns (uint256) {
        return reg.register(owner, name, "ipfs://card", agentAccount, hex"deadbeef");
    }

    function test_RegisterMintsOwnedNft() public {
        uint256 id = _mint(alice, "scout");
        assertEq(reg.ownerOf(id), alice);
        assertEq(reg.tokenURI(id), "ipfs://card");
        assertEq(reg.totalAgents(), 1);
        (uint256 rid, address owner) = reg.resolve("scout");
        assertEq(rid, id);
        assertEq(owner, alice);
    }

    function test_RecordStored() public {
        uint256 id = _mint(alice, "scout");
        (address acct,, string memory uri) = reg.records(id);
        assertEq(acct, agentAccount);
        assertEq(uri, "ipfs://card");
    }

    function test_NameUniqueness() public {
        _mint(alice, "scout");
        vm.expectRevert(abi.encodeWithSelector(CompassAgentRegistry.NameTaken.selector, "scout"));
        _mint(bob, "scout");
    }

    function test_TransferMovesOwnership() public {
        uint256 id = _mint(alice, "scout");
        vm.prank(alice);
        reg.transferFrom(alice, bob, id);
        assertEq(reg.ownerOf(id), bob);
        (, address owner) = reg.resolve("scout");
        assertEq(owner, bob); // ownership follows the token
    }

    function test_OnlyOwnerUpdates() public {
        uint256 id = _mint(alice, "scout");
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(CompassAgentRegistry.NotAgentOwner.selector, id, bob));
        reg.updateAgent(id, "ipfs://new", agentAccount, hex"00");

        vm.prank(alice);
        reg.updateAgent(id, "ipfs://new", address(0xBEEF), hex"01");
        assertEq(reg.tokenURI(id), "ipfs://new");
        (address acct,,) = reg.records(id);
        assertEq(acct, address(0xBEEF));
    }

    function test_ResolveUnknownIsZero() public view {
        (uint256 id, address owner) = reg.resolve("ghost");
        assertEq(id, 0);
        assertEq(owner, address(0));
    }
}
