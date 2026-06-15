// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/// @title CompassAgentRegistry
/// @notice Ownable, transferable agent identity for compass. Each agent is an NFT
///         (tokenId = agentId). The token IS ownership — transferring it transfers the
///         agent. `tokenURI` points to the agent's A2A AgentCard; an on-chain record
///         keeps the fields other contracts may need to read trustlessly. ERC-8004-shaped
///         (self-registration, agentURI), so it stays interoperable with the shared
///         ERC-8004 Identity Registry on Base.
contract CompassAgentRegistry is ERC721, ERC721URIStorage {
    struct AgentRecord {
        address agentAccount; // the agent's MetaMask Smart Account / ERC-6551 TBA
        bytes pubkey; // agent signing/encryption key (signed AgentCards, ECIES A2A)
        string agentCardURI; // == tokenURI; kept on-chain for cheap reads
    }

    uint256 private _nextId = 1;
    mapping(uint256 => AgentRecord) public records; // agentId      -> record
    mapping(bytes32 => uint256) public nameToAgent; // keccak(name) -> agentId

    event AgentRegistered(uint256 indexed agentId, address indexed owner, string name, string agentCardURI);
    event AgentUpdated(uint256 indexed agentId, address agentAccount, string agentCardURI);

    error NameTaken(string name);
    error NotAgentOwner(uint256 agentId, address caller);

    constructor() ERC721("CompassAgent", "AGENT") {}

    /// @notice Mint an agent identity NFT to `owner` and register its handle + endpoint.
    /// @dev Self-registration: anyone may register their own agent (they pay gas).
    function register(
        address owner,
        string calldata name,
        string calldata agentCardURI,
        address agentAccount,
        bytes calldata pubkey
    ) external returns (uint256 agentId) {
        bytes32 nameKey = keccak256(bytes(name));
        if (nameToAgent[nameKey] != 0) revert NameTaken(name);

        agentId = _nextId++;
        _safeMint(owner, agentId);
        _setTokenURI(agentId, agentCardURI);

        records[agentId] = AgentRecord(agentAccount, pubkey, agentCardURI);
        nameToAgent[nameKey] = agentId;

        emit AgentRegistered(agentId, owner, name, agentCardURI);
    }

    /// @notice Update the agent's card / account / key. Only the current NFT owner.
    function updateAgent(uint256 agentId, string calldata agentCardURI, address agentAccount, bytes calldata pubkey)
        external
    {
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner(agentId, msg.sender);
        _setTokenURI(agentId, agentCardURI);
        records[agentId] = AgentRecord(agentAccount, pubkey, agentCardURI);
        emit AgentUpdated(agentId, agentAccount, agentCardURI);
    }

    /// @notice Resolve a human handle to its agent id + current owner.
    function resolve(string calldata name) external view returns (uint256 agentId, address owner) {
        agentId = nameToAgent[keccak256(bytes(name))];
        owner = agentId == 0 ? address(0) : ownerOf(agentId);
    }

    function totalAgents() external view returns (uint256) {
        return _nextId - 1;
    }

    // --- required overrides (OZ v5: ERC721 + ERC721URIStorage) ---

    function tokenURI(uint256 id) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(id);
    }

    function supportsInterface(bytes4 id) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(id);
    }
}
