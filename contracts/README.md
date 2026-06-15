# Contracts

Compass mostly **consumes** MetaMask's already-deployed `DelegationManager`
(resolved at runtime via `getSmartAccountsEnvironment(chainId)` — never
hardcoded). This Foundry project holds only what the demo needs:

- `src/PaidService.sol` — a demo x402-paywalled target so the demo is
  self-contained (Phase 5).
- _(optional)_ x402 + ERC-7710 facilitator helpers, if the flagship
  x402+7710 stretch track is pursued.

Layout (per `foundry.toml`): `src/`, `test/`, `script/`, `lib/` (gitignored),
`out/` + `cache/` (gitignored). `remappings.txt` wires `forge-std` and
`@openzeppelin/contracts`.

```bash
forge build
forge test
```

Nothing here yet — lands in Phase 5. See [../docs/PHASES.md](../docs/PHASES.md).
