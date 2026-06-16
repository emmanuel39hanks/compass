#!/usr/bin/env sh
# Container entrypoint: configure compass from env on first boot, then run the gateway.
# Required env: VENICE_API_KEY, COMPASS_PRIVATE_KEY, TELEGRAM_BOT_TOKEN
# Optional:     COMPASS_NETWORK, COMPASS_AGENT_NAME, COMPASS_BUDGET
set -e

COMPASS=./node_modules/.bin/compass

if [ ! -f compass.config.json ]; then
  echo "compass: configuring from env…"
  "$COMPASS" init \
    --name "${COMPASS_AGENT_NAME:-scout}" \
    --budget "${COMPASS_BUDGET:-25 USDC/week}" \
    --network "${COMPASS_NETWORK:-base-sepolia}" || true
fi

echo "compass: starting gateway…"
exec "$COMPASS" serve
