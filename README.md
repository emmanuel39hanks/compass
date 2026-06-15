<h1 align="center">compass</h1>

<p align="center">
  <b>A multi-agent coordination harness where agents grant each other scoped, revocable on-chain authority.</b>
</p>

<p align="center">
  <sub>MetaMask Smart Accounts Kit · 1Shot Permissionless Relayer · Venice AI · x402</sub>
</p>

---

Compass is an agent harness where a fleet of agents coordinate by **delegating
authority to each other on-chain**. A human grants a principal agent a bounded
budget through MetaMask (ERC-7715). The principal **redelegates** narrower,
caveat-constrained slices of that authority to specialist sub-agents (ERC-7710).
Sub-agents reason with **Venice AI**, pay for data and for each other over
**x402**, and execute on **mainnet** through the **1Shot permissionless relayer**
— gas paid in stablecoins, no paymaster, EOAs upgraded to smart accounts via
EIP-7702. Every grant is narrowable, attributable, and revocable.

The agent-to-agent trust model is expressed in the primitive the MetaMask
ecosystem actually standardises: **redelegation** — so every grant is narrowable,
attributable, and revocable on-chain.

> Built for the **MetaMask Smart Accounts Kit x 1Shot API x Venice AI Dev Cook-Off** (HackQuest).

## Why redelegation is the whole idea

Most "AI agent + wallet" projects hand an agent a private key and hope. That is
all-or-nothing trust. Compass instead models every capability as a **signed
delegation** with on-chain **caveats**:

- A principal can grant a trading sub-agent *"spend ≤ 25 USDC/day, only to these
  contracts, only this week"* — and nothing more.
- That sub-agent can **redelegate** a still-narrower slice onward (it can only
  ever narrow, never widen).
- Any link is **revocable on-chain** the moment it misbehaves.

This is exactly the **Best A2A Coordination** track's qualifying requirement
(redelegation), and it is a genuinely safer architecture for autonomous agents.

## Prize tracks (one build, three prizes)

| Track | Prize | How compass qualifies |
|---|---|---|
| **Best A2A Coordination** (anchor) | $3,000 | Principal → sub-agent **redelegation chains** (ERC-7710) are the coordination spine |
| **Best use of Venice AI** | $3,000 | Venice is the agents' reasoning brain *and* media/x402 surface — core to the main flow |
| **Best use of 1Shot Relayer** | $1,000 | EIP-7702 account upgrade + ERC-7710 **mainnet** relay, status via 1Shot **webhooks** |
| _(stretch)_ Best x402 + ERC-7710 | $3,000 | A 7710 facilitator lets agents pay x402 paywalls from a *delegated* allowance |

## Architecture at a glance

```
                    ┌──────────────────────────────────────────────┐
   Human (MetaMask) │  ERC-7715 grant: "≤ 50 USDC / week"            │
        │           └──────────────────────────────────────────────┘
        ▼
  ┌───────────────┐   redelegate (ERC-7710, narrowed + caveats)   ┌───────────────┐
  │ Principal     │ ────────────────────────────────────────────▶ │ Research agent│
  │ agent         │ ────────────────────────────────────────────▶ │ Exec agent    │
  └───────────────┘                                                └───────┬───────┘
        │ Venice (reason)         x402 (pay per call)                      │ redeem
        ▼                                                                   ▼
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │ 1Shot permissionless relayer — EIP-7702 upgrade + ERC-7710 mainnet relay,      │
  │ gas in USDC, status via webhooks                                               │
  └──────────────────────────────────────────────────────────────────────────────┘
```

Six layers, each a workspace package:

| Layer | Package | Role |
|---|---|---|
| Harness | `@compass_agents/core` | Brain interface, tool registry, runtime loop, approval gates, memory, config |
| Brain | `@compass_agents/brain-venice` | Venice AI provider (OpenAI-compatible chat + tools + media) |
| Authority | `@compass_agents/delegation` | MetaMask Smart Accounts Kit: accounts, delegation, redelegation, caveats |
| Gas/relay | `@compass_agents/relayer-1shot` | 1Shot JSON-RPC: 7702 upgrade, 7710 relay, webhook verify |
| Payments | `@compass_agents/x402` | x402 client + ERC-7710 facilitator |
| Coordination | `@compass_agents/plugin-a2a` | Redelegation transport, peer registry, coordination protocol |
| Operator | `@compass_agents/cli` | TUI: `init`, chat, `/delegate`, `/redelegate`, `/revoke`, status feed |

## Tech stack

**Bun** workspaces · **TypeScript** (strict) · **viem** ·
**@metamask/smart-accounts-kit** · **@noble** crypto · **Biome** ·
**Foundry** (the agent registry) · `bun test`.

## Quickstart (use it)

Requires [bun](https://bun.sh) ≥ 1.1 (the CLI runs on bun).

```bash
npm i -g @compass_agents/cli          # or: bun add -g @compass_agents/cli
compass init --name scout --budget "25 USDC/week"
export VENICE_API_KEY=…        # free key: venice.ai/settings/api/keys
export COMPASS_PRIVATE_KEY=…   # a burner; fund with Base Sepolia USDC (faucet.circle.com)
compass doctor                 # check you're ready for a real on-chain action
compass                        # chat — "what's my balance?", "send 0.1 USDC to 0x…"
```

Then make it real:

```bash
compass connect                # grant a budget from MetaMask in the browser (ERC-7715)
compass register scout         # mint your agent identity NFT on Base (you own it)
compass serve                  # text your agent from Telegram (set TELEGRAM_BOT_TOKEN)
compass logs                   # the activity log (every tool call + on-chain action)
```

### Develop

```bash
bun install
bun test && bun run typecheck && bun run lint
bun packages/cli/bin/compass demo   # offline end-to-end spine
```

## Repo layout

```
compass/
├── packages/
│   ├── core/            # agent harness
│   ├── brain-venice/    # Venice brain provider
│   ├── delegation/      # MetaMask Smart Accounts Kit wrapper (ERC-7710/7715)
│   ├── relayer-1shot/   # 1Shot permissionless relayer adapter
│   ├── x402/            # x402 buyer/seller + 7710 facilitator
│   ├── plugin-a2a/      # agent-to-agent: signed+encrypted transport, discovery, hire
│   ├── gateway/         # long-lived agent service: one brain, many surfaces, pairing
│   ├── plugin-telegram/ # Telegram surface (Bot API, approvals, pairing, chunking)
│   └── cli/             # commands: init/register/chat/serve/budget/logs/memory/doctor
├── contracts/           # Foundry: CompassAgentRegistry (ERC-8004-shaped agent NFT)
└── test/local/          # integration tests (real APIs / on-chain relays)
```

## Status

**Working end-to-end on Base Sepolia, milestones M0–M8.** 209 TS tests + 6
Solidity tests pass; typecheck + lint clean. Live on-chain proofs (Base Sepolia):

- **Agent registry deployed** — [`0x5eDc156E…E650`](https://sepolia.basescan.org/address/0x5eDc156Ef946261D9c66ECC17218952D77BFE650), agent #1 "scout" minted.
- **Gasless USDC relay** via 1Shot (gas in USDC, EOA upgraded via EIP-7702) — tx [`0xd30e7efe…`](https://sepolia.basescan.org/tx/0xd30e7efeeb71ecfc9335ebbc993275325fd414f8faa0b2cc0cbe23ce0b3f99cf).
- **Agents hire agents** over a real, signed+encrypted network — two HTTP servers, owner seals a
  budget grant to the helper's pubkey, the helper redeems on-chain — tx [`0x9d770ab7…`](https://sepolia.basescan.org/tx/0x9d770ab7970303dbd2acc7992627e52d111f4fa2b0e495bf5e2f5e593a3e191c).

What's built: agent harness + Venice brain; ERC-7710 delegation core + budgets; 1Shot relayer
(EIP-7702 + USDC gas); ERC-8004 agent identity NFT; A2A network (discovery, ECIES transport, hire,
revoke); gateway + Telegram surface (pairing, keyboard approvals); durable memory (threat-scanned
writes, activity log, encrypted export, compaction); x402 buyer/seller + recurring budgets. The
on-chain caveat is the security floor — proven in `caveat-floor.test.ts`.

The **1Shot mainnet relay + Base-mainnet registry** (the $1k prize requirement) are the one
remaining opt-in step — testnet-baked and ready.

## License

MIT
