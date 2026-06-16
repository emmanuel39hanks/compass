# Deploy your compass agent

compass is **self-hosted** — you run your own agent with your own keys and your own
Telegram bot. There's no shared server; nobody else can see or touch your wallet,
budget, or chats. This guide gets you live, from "on my laptop" to "always-on in the cloud."

Pick the row that fits you:

| Where | Best for | Effort |
|---|---|---|
| [Local](#local) | trying it, dev | 1 min |
| [Any VPS](#any-vps-hostinger--ec2--droplet) (Hostinger / EC2 / DigitalOcean droplet) | always-on, you own the box | ~5 min |
| [Docker](#docker-any-host) | containers, reproducible | ~3 min |
| [Railway](#railway) | managed, no server to babysit | ~3 min |

---

## What you need (all options)

Three secrets. `compass init` will ask for them, or set them as env vars for a headless deploy:

1. **A burner wallet** — a `0x…` private key. Fund it with a little **Base Sepolia USDC** ([faucet](https://faucet.circle.com)) so it can act. → `COMPASS_PRIVATE_KEY`
2. **A Venice API key** — free at [venice.ai/settings/api/keys](https://venice.ai/settings/api/keys). → `VENICE_API_KEY`
3. **Your own Telegram bot token** — message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token. → `TELEGRAM_BOT_TOKEN`

> You create and run the bot. compass never hosts it for you — your token, your bot, your agent.

---

## Local

```bash
npm i -g @compass_agents/cli      # needs bun (https://bun.sh)
compass init                      # interactive — also asks for your bot token
compass serve                     # live on your Telegram bot
```

`Ctrl-C` to stop. The first time someone DMs your bot it shows a pairing code; approve it with
`compass pairing approve telegram <code>`.

---

## Any VPS (Hostinger / EC2 / droplet)

These are all just a Linux box — the steps are identical. SSH in, then:

```bash
# 1. install bun + the CLI + a process manager
curl -fsSL https://bun.sh/install | bash && source ~/.bashrc
bun add -g @compass_agents/cli pm2

# 2. set up your agent (interactive, or pass --name/--budget/--network + env vars)
compass init

# 3. keep it running — restarts on crash and on reboot
pm2 start "$(which compass) serve" --name compass
pm2 save && pm2 startup        # run the line it prints
```

Update later with `bun add -g @compass_agents/cli && pm2 restart compass`.
Logs: `pm2 logs compass`.

---

## Docker (any host)

Runs the same image everywhere. From a clone of this repo:

```bash
cp .env.example .env       # fill in your three secrets
docker compose up -d       # build + run, restarts automatically
docker compose logs -f     # watch it
```

State (pairing, memory, activity log) persists in the `compass-data` volume across restarts.
Stop with `docker compose down` (keeps the volume).

---

## Railway

```bash
railway init
railway up                 # builds the Dockerfile
```

Then set the variables in the Railway dashboard (or `railway variables --set KEY=value`):

```
COMPASS_PRIVATE_KEY   0x…
VENICE_API_KEY        …
TELEGRAM_BOT_TOKEN    …          # from @BotFather
COMPASS_NETWORK       base-sepolia
COMPASS_BUDGET        25 USDC/week
```

Add a **volume mounted at `/app/.compass`** so pairing + memory survive redeploys.
Railway keeps the service running and restarts on failure.

---

## After it's live

- **DM your bot** — "what's my balance?", "send 5 USDC to 0x…". Write actions pop an
  inline-keyboard approval; tap **Allow**.
- **Grant a budget from MetaMask** (optional, non-custodial): `compass connect` opens a page
  to grant an ERC-7715 spending budget — your agent spends within it, you revoke any time.
- **Audit everything**: `compass logs` (or `pm2 logs` / `docker compose logs`).

That's it — your agent, your keys, your box.
