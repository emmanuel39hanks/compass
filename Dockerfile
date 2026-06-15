# compass live gateway — runs `compass serve` (Telegram surface) as a service.
# Bun-native: ships TypeScript source, no build step.
FROM oven/bun:1

WORKDIR /app

# Install deps first (better layer caching). Workspace manifests + lockfile.
COPY package.json bun.lock ./
COPY packages ./packages
RUN bun install --frozen-lockfile

# App source (bin + any remaining files).
COPY . .

# Persisted across restarts via a Railway volume mounted at /app/.compass
# (memory, pairing, activity log). Config is regenerated from env on boot.
ENV COMPASS_AGENT_NAME=scout \
    COMPASS_BUDGET="25 USDC/week"

CMD ["sh", "scripts/start.sh"]
