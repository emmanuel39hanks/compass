/**
 * @compass_agents/relayer-1shot — 1Shot permissionless relayer adapter.
 *
 * Raw JSON-RPC client (no signup): capabilities / estimate / send7710 / status,
 * EIP-7702 authorization mapping, stablecoin fee logic, and Ed25519/JWKS
 * webhook verification. See docs/INTEGRATIONS.md#1shot.
 */
export const PACKAGE = '@compass_agents/relayer-1shot' as const
export const ROLE = '1shot relayer adapter' as const

export * from './types'
export * from './client'
export * from './auth-7702'
export * from './fee'
export * from './webhook'
export * from './execute'
