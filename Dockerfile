# compass live gateway — runs `compass serve` (Telegram surface) as a service.
# Bun-native: ships TypeScript source, no build step. Builds from the repo so it's
# self-contained and reproducible (used by Railway and `docker compose`).
FROM oven/bun:1

WORKDIR /app

# Install deps first (better layer caching). Workspace manifests + lockfile.
COPY package.json bun.lock ./
COPY packages ./packages
RUN bun install --frozen-lockfile

# App source (bin + any remaining files).
COPY . .

# Persisted across restarts via a volume mounted at /app/.compass
# (memory, pairing, activity log). Config is regenerated from env on boot.
ENV COMPASS_AGENT_NAME=scout \
    COMPASS_BUDGET="25 USDC/week" \
    COMPASS_NETWORK=base-sepolia

CMD ["sh", "scripts/start.sh"]
