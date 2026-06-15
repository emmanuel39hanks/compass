# @compass_agents/cli

**compass** — your personal on-chain agent. Give it a budget, and it acts for you
within **strict, revocable limits enforced on-chain**: check balances, send USDC
(gasless — gas paid in USDC, no ETH), search the web, and **hire other agents** to
do work within a slice of your budget. It reasons with Venice AI, runs on MetaMask
Smart Accounts (ERC-7710 redelegation), and executes through the 1Shot relayer.

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

## 2. Set up

```bash
compass init --name scout --budget "25 USDC/week"
```

Provide two secrets via environment variables (never commit them):

```bash
export VENICE_API_KEY=your_venice_key
export COMPASS_PRIVATE_KEY=0xyour_burner_private_key
```

Fund the burner with Base Sepolia USDC from the faucet above.

## 3. Check you're ready

```bash
compass doctor
```

Verifies your config, keys, network, USDC/ETH balance, and the agent registry.
All green = you can take a real on-chain action.

## 4. Chat with your agent

```bash
compass
```

Talk in plain English:

```
you › what's my balance?
you › search the web for the current ETH price
you › send 0.1 USDC to 0x1234…            # asks for approval first
you › hire a helper to pay 0x1234… 0.05 USDC
```

Anything that spends asks for approval, and the agent can **never exceed your
budget** — that limit is an on-chain caveat, not a setting it can ignore.

## 5. (Optional) Connect MetaMask instead of a local key

Instead of the agent holding a key, grant it a budget straight from **your real
MetaMask** wallet:

```bash
compass connect
```

This opens your browser to a local page where you connect MetaMask and grant the
agent a spending budget via **ERC-7715 advanced permissions** (the MetaMask Smart
Accounts "request permissions" popup). The agent then spends within that budget,
gaslessly, and you can revoke any time. *Requires MetaMask Flask for ERC-7715.*

## 6. Own your agent (on-chain identity)

```bash
compass register scout      # mint your agent identity NFT on Base — you own it
```

## 7. Reach it from anywhere (Telegram)

```bash
export TELEGRAM_BOT_TOKEN=your_botfather_token
compass serve               # now text your agent on Telegram
```

Unknown senders get a pairing code; approve them with
`compass pairing approve telegram <code>`. Dangerous actions arrive as inline
[Allow once] [Session] [Deny] buttons.

## Commands

| Command | What it does |
|---|---|
| `compass` | Chat with your agent (REPL) |
| `compass init` | Interactive setup: wallet, budget, keys |
| `compass connect` | Grant a budget from MetaMask in the browser (ERC-7715) |
| `compass doctor` | Readiness check (keys, network, balances) |
| `compass register <name>` | Mint your agent identity NFT |
| `compass serve` | Run as a gateway — reachable on Telegram |
| `compass pairing <list\|approve\|revoke>` | Manage who can reach your agent |
| `compass budget --recurring "25 USDC/week"` | Set/show the recurring budget |
| `compass logs [--tail N]` | Activity log (tool calls + on-chain actions) |
| `compass memory <export\|import> <file>` | Encrypted, portable agent memory |

## Agent tools

`chain.balance`, `chain.send`, `a2a.hire`, `a2a.revoke`, `pay` (x402),
`web.search`, `web.fetch`, `memory.save`, `memory.read`.

## Networks

Defaults to **Base Sepolia** (testnet). For Base mainnet:
`compass init --network base` and fund the burner with a little real USDC (relays
pay gas in USDC).

## Links

- Source: <https://github.com/emmanuel39hanks/compass>
- The agent is reachable live on Telegram at **@compass_agentbot**

## License

MIT
