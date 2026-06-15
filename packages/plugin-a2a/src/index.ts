/**
 * @compass_agents/plugin-a2a — agent-to-agent coordination via redelegation.
 *
 * Peer registry, a transport bus, the redelegation-based coordinator
 * (request -> grant -> redeem -> revoke), and the agent tool surface. The
 * Best A2A Coordination spine. See docs/ARCHITECTURE.md#a2a.
 */
export const PACKAGE = '@compass_agents/plugin-a2a' as const
export const ROLE = 'a2a redelegation coordination' as const

export * from './envelope'
export * from './peers'
export * from './bus'
export * from './crypto'
export * from './http'
export * from './discovery'
export * from './coordinator'
export * from './hire'
export * from './tools'
