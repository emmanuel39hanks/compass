# compass — self-hosted agent gateway. Installs the published CLI and runs `compass serve`.
# The same image works on Railway, Fly, a VPS (Hostinger / EC2 / droplet), or locally.
FROM oven/bun:1
WORKDIR /app

# Install the published CLI from npm — no repo checkout or build step.
ARG COMPASS_VERSION=latest
RUN echo '{"name":"compass-host","private":true}' > package.json \
 && bun add @compass_agents/cli@${COMPASS_VERSION}

# Pairing, memory, and the activity log live here — mount a volume to persist them.
VOLUME ["/app/.compass"]

# Defaults; override with your own env (COMPASS_NETWORK, COMPASS_BUDGET, …).
ENV COMPASS_AGENT_NAME=scout \
    COMPASS_BUDGET="25 USDC/week" \
    COMPASS_NETWORK=base-sepolia

COPY scripts/start.sh /app/start.sh
CMD ["sh", "/app/start.sh"]
