// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ValidationRegistry
/// @notice ERC-8004 Validation Registry for compass agents. A requester asks a
///         validator to attest to an agent's work; the validator responds with a
///         score; `getSummary` aggregates responses so reputation can be backed by
///         independent validation, not just client feedback.
contract ValidationRegistry {
    struct Validation {
        address validatorAddress;
        uint256 agentId;
        uint8 response; // 0..100
        bytes32 responseHash;
        string tag;
        uint256 lastUpdate;
        bool responded;
    }

    mapping(bytes32 => Validation) private _byRequest; // requestHash => validation
    mapping(uint256 => bytes32[]) private _agentRequests; // agentId  => requestHashes

    event ValidationRequest(
        address indexed validatorAddress, uint256 indexed agentId, bytes32 requestHash, string requestURI
    );
    event ValidationResponse(bytes32 indexed requestHash, uint8 response, string tag);

    error NotValidator(bytes32 requestHash, address caller);

    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external {
        _byRequest[requestHash] =
            Validation(validatorAddress, agentId, 0, bytes32(0), "", block.timestamp, false);
        _agentRequests[agentId].push(requestHash);
        emit ValidationRequest(validatorAddress, agentId, requestHash, requestURI);
    }

    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata, /*responseURI*/
        bytes32 responseHash,
        string calldata tag
    ) external {
        Validation storage v = _byRequest[requestHash];
        if (v.validatorAddress != msg.sender) revert NotValidator(requestHash, msg.sender);
        v.response = response;
        v.responseHash = responseHash;
        v.tag = tag;
        v.lastUpdate = block.timestamp;
        v.responded = true;
        emit ValidationResponse(requestHash, response, tag);
    }

    function getValidationStatus(bytes32 requestHash)
        external
        view
        returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string memory tag, uint256 lastUpdate)
    {
        Validation storage v = _byRequest[requestHash];
        return (v.validatorAddress, v.agentId, v.response, v.responseHash, v.tag, v.lastUpdate);
    }

    function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory) {
        return _agentRequests[agentId];
    }

    /// @notice Aggregate an agent's answered validations into (count, averageResponse).
    function getSummary(uint256 agentId, address[] calldata validatorAddresses, string calldata tag)
        external
        view
        returns (uint64 count, uint8 averageResponse)
    {
        bytes32[] storage reqs = _agentRequests[agentId];
        bool filterV = validatorAddresses.length > 0;
        bool filterT = bytes(tag).length > 0;
        uint256 total = 0;
        uint64 n = 0;
        for (uint256 i = 0; i < reqs.length; i++) {
            Validation storage v = _byRequest[reqs[i]];
            if (!v.responded) continue;
            if (filterT && keccak256(bytes(v.tag)) != keccak256(bytes(tag))) continue;
            if (filterV && !_inList(validatorAddresses, v.validatorAddress)) continue;
            total += v.response;
            n++;
        }
        count = n;
        averageResponse = n > 0 ? uint8(total / n) : 0;
    }

    function _inList(address[] calldata list, address a) private pure returns (bool) {
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == a) return true;
        }
        return false;
    }
}
