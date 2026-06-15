import { defineConfig } from '@compass_agents/core'

/**
 * Example operator config. Copy to `compass.config.ts` (gitignored) and edit.
 * Secrets come from the environment (.env), never from this file.
 */
export default defineConfig({
  identity: {
    signerSource: 'privkey', // COMPASS_PRIVATE_KEY
  },
  network: {
    chainId: 84_532, // Base Sepolia; switch to 8453 (Base mainnet) for the 1Shot prize
    rpcUrl: 'https://sepolia.base.org',
  },
  brain: {
    provider: 'venice',
    model: 'qwen3-next-80b',
    baseUrl: 'https://api.venice.ai/api/v1',
  },
  relayer: {
    // testnet relayer; use https://relayer.1shotapi.com/relayers on mainnet
    endpoint: 'https://relayer.1shotapi.dev/relayers',
  },
  approvals: { mode: 'prompt' },
  plugins: ['a2a'],
})
