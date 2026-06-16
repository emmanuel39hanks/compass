/**
 * @compass_agents/x402 — x402 payment client + ERC-7710 facilitator.
 *
 * Client: wrap fetch to handle 402 -> pay -> retry, paying from a delegated
 * allowance. Facilitator: verify by simulating redeemDelegations, settle via
 * the 1Shot relayer. See docs/INTEGRATIONS.md#x402.
 */
export const PACKAGE = '@compass_agents/x402' as const
export const ROLE = 'x402 client + 7710 facilitator' as const

export * from './types'
export * from './client'
export * from './facilitator'
export * from './server'
export * from './bazaar'
