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
npm i -g @compass_agents/cli      # bun required (the CLI runs on bun)
compass init                      # interactive setup — it asks you everything:
                                  #   network · name · budget · wallet · Venice key
compass                           # chat: "what's my balance?", "send 5 USDC to 0x…"
```

`compass init` is a guided wizard — it can **generate a wallet** (or connect MetaMask),
takes your free [Venice](https://venice.ai/settings/api/keys) key, and writes a local
`.env` so `compass` just works. Fund the wallet it shows you with Base Sepolia USDC
([faucet](https://faucet.circle.com)), then go.

```
compass — set up your agent
│  Which network?               ›  Base Sepolia (testnet)
│  Name your agent              ›  scout
│  Weekly spending limit        ›  25 USDC/week
│  How should your agent get funds?
│     › Connect MetaMask & grant a budget   (ERC-7715 · needs Flask)
│       Generate a new burner wallet        (testnet — simplest)
│       Paste an existing private key
│  Venice API key               ›  ••••••••
│  Telegram bot token           ›  (optional — from @BotFather)
└  ✓ ready — run `compass`
```

Then make it real:

```bash
compass connect                # grant a budget from MetaMask in the browser (ERC-7715)
compass register scout         # mint your agent identity NFT on Base (you own it)
compass serve                  # go live on your own Telegram bot
compass doctor                 # readiness check · compass logs — activity log
```

### Run it on Telegram (your own bot)

compass is **self-hosted**: you create your own bot with [@BotFather](https://t.me/BotFather)
and run the agent yourself — your token, your keys, your box. `compass init` asks for the
bot token; after that `compass serve` brings it online. To keep it always-on (local, a VPS
like Hostinger / EC2 / a droplet, Docker, or Railway), see **[DEPLOY.md](./DEPLOY.md)** —
each option is a copy-paste block.

## What your agent can do

Talk to it in plain English (terminal or Telegram). Beyond sending USDC and hiring
helper agents, it can now **find** and **create**:

| Capability | Tools | What it does |
|---|---|---|
| **Discover services** | `discover` | Searches the [x402 Bazaar](https://docs.cdp.coinbase.com/x402/bazaar) for payable datasets/APIs, then `pay` buys one from your budget — the agent sources data on its own. |
| **Pay for data** | `pay` | Buys a paid (x402) resource from a *delegated* allowance — gasless via 1Shot. |
| **Hire agents** | `a2a.hire` · `a2a.grant` | Redelegates a bounded, revocable budget to a specialist agent (ERC-7710). |
| **Check reputation** | `a2a.reputation` | Reads a peer's on-chain [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) reputation before hiring it (Identity + Reputation + Validation registries). |
| **Create media** | `venice.image` · `venice.vision` · `venice.speak` | Generate images, analyze images, and text-to-speech via Venice — saved to `.compass/media/`. |
| **Research** | `web.search` · `web.fetch` | Search the web and read pages. |
| **Inherit any tool** | MCP | Connect [MCP](https://modelcontextprotocol.io) servers (filesystem, GitHub, databases, …) — their tools become the agent's. |

Make it discoverable to other agents, and plug in MCP servers:

```bash
compass card                     # writes a standard A2A /.well-known/agent-card.json
# .compass/mcp.json — add MCP servers (Claude-Desktop-style):
#   { "mcpServers": { "fs": { "command": "npx",
#       "args": ["-y","@modelcontextprotocol/server-filesystem","/data"] } } }
```

The chat runs in a rich **OpenTUI** interface (live "thinking…" status, inline
approvals) and falls back to a plain readline prompt if the terminal can't host it.

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
