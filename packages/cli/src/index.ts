/**
 * @compass_agents/cli — operator CLI and composition root.
 *
 * Command parsing, the Compass orchestrator (Venice brain + A2A tools + harness
 * loop), and the end-to-end demo spine. See docs/DEMO.md.
 */
export const PACKAGE = '@compass_agents/cli' as const
export const ROLE = 'cli / tui' as const

export * from './commands'
export * from './chat'
export * from './onchain'
export * from './init'
export * from './status'
export * from './orchestrator'
export * from './demo'
