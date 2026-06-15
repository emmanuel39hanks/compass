// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {CompassAgentRegistry} from "../src/CompassAgentRegistry.sol";

/// @notice Deploy the agent registry.
/// Usage: forge script contracts/script/DeployAgentRegistry.s.sol \
///          --rpc-url base_sepolia --broadcast --private-key $PRIVATE_KEY
contract DeployAgentRegistry is Script {
    function run() external returns (CompassAgentRegistry reg) {
        vm.startBroadcast();
        reg = new CompassAgentRegistry();
        vm.stopBroadcast();
    }
}
