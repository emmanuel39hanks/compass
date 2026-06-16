# @compass_agents/cli

**compass** — your personal on-chain agent. Give it a budget, and it acts for you
within **strict, revocable limits enforced on-chain**. It can send USDC (gasless —
gas paid in USDC, no ETH), **hire other agents** within a slice of your budget,
**discover and buy** data over x402, **check a peer's on-chain reputation** before
trusting it, generate and analyze media, search the web, and more. It reasons with
Venice AI, runs on MetaMask Smart Accounts (ERC-7710 redelegation), and executes
through the 1Shot relayer.

Built for the **MetaMask Smart Accounts Kit × 1Shot × Venice** Dev Cook-Off.

---

## Requirements

- [Bun](https://bun.sh) ≥ 1.1 (the CLI runs on Bun)
- A free **Venice API key** → <https://venice.ai/settings/api/keys>
- A **burner** wallet private key (testnet only — never use a wallet with real value)
- Base Sepolia **testnet USDC** → <https://faucet.circle.com> (+ a little testnet ETH)

## 1. Install

```bash
npm i -g @compass_agents/cli
# or: bun add -g @compass_agents/cli
```

## 2. Set up (interactive)

```bash
compass init
```

A guided wizard: pick a network, name your agent, set a weekly budget, choose a
wallet (generate a burner, paste a key, or **connect MetaMask**), drop in your
Venice key, and optionally a Telegram bot token. It writes a local `.env` so
`compass` just works. Fund the wallet it shows you with Base Sepolia USDC.

## 3. Chat with your agent

```bash
compass
```

Runs a rich **OpenTUI** chat (with a live "thinking…" status and inline approvals;
falls back to a plain prompt if the terminal can't host it). Talk in plain English:

```
you › what's my balance?
you › find me a crypto-price dataset and buy it          # x402 Bazaar → pay
you › send 0.1 USDC to 0x1234…                           # asks for approval first
you › what's scout's reputation?                         # reads ERC-8004 on-chain
you › hire a helper to pay 0x1234… 0.05 USDC
you › draw a flat compass logo                           # Venice image → .compass/media
```

Prefer shortcuts? **Slash commands** reach a capability directly (still gated):

```
/balance                       /discover [query]        /reputation <agent>
/send <amount> <address>       /pay <url>               /image <prompt>
/hire <amount> <address>       /search <query>          /say <text>
/help                          /exit
```

Anything that spends asks for approval, and the agent can **never exceed your
budget** — that limit is an on-chain caveat, not a setting it can ignore. The
agent is **chain-aware**: it knows its network and reports balances as
"0 USDC on Base Sepolia · wallet 0x…" so you always know which chain you're on.

## 4. Connect MetaMask (optional, non-custodial)

```bash
compass connect
```

Opens your browser to grant the agent a spending budget straight from **your real
MetaMask** via **ERC-7715 advanced permissions**. The agent spends within it,
gaslessly, and you can revoke any time. *Requires MetaMask Flask.*

## 5. Identity, reputation & discovery

```bash
compass register scout      # mint your agent identity NFT (ERC-8004) — you own it
compass card                # write a standard A2A /.well-known/agent-card.json
```

The ERC-8004 **Reputation + Validation** registries are live on Base Sepolia, so
`a2a.reputation` returns real on-chain scores.

## 6. Self-host on Telegram

```bash
export TELEGRAM_BOT_TOKEN=your_botfather_token   # your own bot, you run it
compass serve
```

You create the bot with [@BotFather](https://t.me/BotFather) and host it yourself.
Unknown senders get a pairing code (`compass pairing approve telegram <code>`);
dangerous actions arrive as inline [Allow] [Deny] buttons. To keep it always-on
(local, a VPS, Docker, or Railway) see [DEPLOY.md](https://github.com/emmanuel39hanks/compass/blob/main/DEPLOY.md).

## 7. MCP — both directions

Connect external [MCP](https://modelcontextprotocol.io) servers (their tools become
the agent's) via `.compass/mcp.json`, **or** expose compass *as* an MCP server:

```bash
compass-mcp                 # serves compass's tools over stdio to any MCP client
# Claude Desktop: { "mcpServers": { "compass": { "command": "compass-mcp" } } }
```

## Commands

| Command | What it does |
|---|---|
| `compass` | Chat with your agent (OpenTUI) |
| `compass init` | Interactive setup: network, wallet, budget, keys |
| `compass connect` | Grant a budget from MetaMask in the browser (ERC-7715) |
| `compass register <name>` | Mint your agent identity NFT (ERC-8004) |
| `compass card` | Write a standard A2A AgentCard |
| `compass doctor` | Readiness check (keys, network, balances) |
| `compass serve` | Run as a gateway — reachable on your Telegram bot |
| `compass pairing <list\|approve\|revoke>` | Manage who can reach your agent |
| `compass budget --recurring "25 USDC/week"` | Set/show the recurring budget |
| `compass logs [--tail N]` | Activity log (tool calls + on-chain actions) |
| `compass memory <export\|import> <file>` | Encrypted, portable agent memory |
| `compass-mcp` | Serve compass's tools as an MCP server (stdio) |

## Agent tools

`chain.balance` · `chain.send` · `a2a.hire` · `a2a.grant` · `a2a.revoke` ·
`a2a.reputation` · `pay` (x402) · `discover` (x402 Bazaar) · `venice.image` ·
`venice.vision` · `venice.speak` · `web.search` · `web.fetch` · `memory.save` ·
`memory.read` — plus any tools from connected MCP servers.

## Networks

Defaults to **Base Sepolia** (testnet). For Base mainnet: `compass init` → choose
Base, and fund the burner with a little real USDC (relays pay gas in USDC).

## Links

- Source & docs: <https://github.com/emmanuel39hanks/compass>

## License

MIT
