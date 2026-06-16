// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ReputationRegistry
/// @notice ERC-8004 Reputation Registry for compass agents. Clients leave on-chain
///         feedback (a signed score) for an agent identified by its agentId in the
///         Identity Registry; `getSummary` aggregates it so an agent can vet a peer
///         before hiring it. Minimal but faithful to the ERC-8004 interface.
contract ReputationRegistry {
    struct Feedback {
        int128 value; // the score, interpreted with valueDecimals
        uint8 valueDecimals;
        string tag1;
        string tag2;
        bool isRevoked;
    }

    // agentId => client => feedback list
    mapping(uint256 => mapping(address => Feedback[])) private _feedback;
    // agentId => clients who have left feedback
    mapping(uint256 => address[]) private _clients;
    mapping(uint256 => mapping(address => bool)) private _hasClient;

    event NewFeedback(
        uint256 indexed agentId,
        address indexed client,
        int128 value,
        uint8 valueDecimals,
        string tag1,
        string tag2,
        string feedbackURI,
        bytes32 feedbackHash
    );
    event FeedbackRevoked(uint256 indexed agentId, address indexed client, uint64 feedbackIndex);

    /// @notice Leave feedback for an agent. `endpoint`/`feedbackURI`/`feedbackHash`
    ///         are off-chain references surfaced in the event for indexers.
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata, /*endpoint*/
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        _feedback[agentId][msg.sender].push(Feedback(value, valueDecimals, tag1, tag2, false));
        if (!_hasClient[agentId][msg.sender]) {
            _hasClient[agentId][msg.sender] = true;
            _clients[agentId].push(msg.sender);
        }
        emit NewFeedback(agentId, msg.sender, value, valueDecimals, tag1, tag2, feedbackURI, feedbackHash);
    }

    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        _feedback[agentId][msg.sender][feedbackIndex].isRevoked = true;
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    function getClients(uint256 agentId) external view returns (address[] memory) {
        return _clients[agentId];
    }

    function getLastIndex(uint256 agentId, address client) external view returns (uint64) {
        return uint64(_feedback[agentId][client].length);
    }

    /// @notice Aggregate an agent's feedback into (count, averageValue, decimals).
    ///         Empty `clientAddresses` aggregates over all clients; empty tags match any.
    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2
    ) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals) {
        address[] memory clients;
        if (clientAddresses.length > 0) {
            clients = clientAddresses;
        } else {
            clients = _clients[agentId];
        }
        int256 total = 0;
        for (uint256 i = 0; i < clients.length; i++) {
            Feedback[] storage fbs = _feedback[agentId][clients[i]];
            for (uint256 j = 0; j < fbs.length; j++) {
                if (!_matches(fbs[j], tag1, tag2)) continue;
                total += int256(fbs[j].value);
                summaryValueDecimals = fbs[j].valueDecimals;
                count++;
            }
        }
        summaryValue = count > 0 ? int128(total / int256(uint256(count))) : int128(0);
    }

    /// @dev A feedback entry passes if it isn't revoked and matches any provided tag filter.
    function _matches(Feedback storage fb, string calldata tag1, string calldata tag2)
        private
        view
        returns (bool)
    {
        if (fb.isRevoked) return false;
        if (bytes(tag1).length > 0 && keccak256(bytes(fb.tag1)) != keccak256(bytes(tag1))) return false;
        if (bytes(tag2).length > 0 && keccak256(bytes(fb.tag2)) != keccak256(bytes(tag2))) return false;
        return true;
    }
}
