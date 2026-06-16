#!/usr/bin/env sh
# Container entrypoint (Railway / docker compose): configure from env on first boot,
# then run the gateway. Secrets come from env:
#   VENICE_API_KEY, COMPASS_PRIVATE_KEY, TELEGRAM_BOT_TOKEN
# Optional config: COMPASS_NETWORK, COMPASS_AGENT_NAME, COMPASS_BUDGET
set -e

if [ ! -f compass.config.json ]; then
  echo "compass: configuring from env…"
  bun packages/cli/bin/compass init \
    --name "${COMPASS_AGENT_NAME:-scout}" \
    --budget "${COMPASS_BUDGET:-25 USDC/week}" \
    --network "${COMPASS_NETWORK:-base-sepolia}" || true
fi

echo "compass: starting gateway…"
exec bun packages/cli/bin/compass serve
