// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {ValidationRegistry} from "../src/ValidationRegistry.sol";

/// @notice Deploy the ERC-8004 Reputation + Validation registries.
/// Usage: forge script contracts/script/DeployReputation.s.sol \
///          --rpc-url base_sepolia --broadcast --private-key $PRIVATE_KEY
contract DeployReputation is Script {
    function run() external returns (ReputationRegistry rep, ValidationRegistry val) {
        vm.startBroadcast();
        rep = new ReputationRegistry();
        val = new ValidationRegistry();
        vm.stopBroadcast();
        console.log("ReputationRegistry:", address(rep));
        console.log("ValidationRegistry:", address(val));
    }
}
