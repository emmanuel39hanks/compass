#!/usr/bin/env sh
# Railway / container entrypoint: ensure config exists, then run the gateway.
# Secrets come from env (VENICE_API_KEY, COMPASS_PRIVATE_KEY, TELEGRAM_BOT_TOKEN).
set -e

CONFIG=compass.config.json
if [ ! -f "$CONFIG" ]; then
  echo "compass: initializing config…"
  bun packages/cli/bin/compass init \
    --name "${COMPASS_AGENT_NAME:-scout}" \
    --budget "${COMPASS_BUDGET:-25 USDC/week}" \
    --network "${COMPASS_NETWORK:-base-sepolia}" || true
fi

echo "compass: starting gateway (serve)…"
exec bun packages/cli/bin/compass serve
