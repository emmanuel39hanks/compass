/**
 * @compass_agents/gateway — the agent as a long-lived service. One brain, many surfaces
 * (TUI, Telegram, A2A). Pairing gate, per-chat sessions, surface-bridged
 * approvals. See docs/plan/05-reach.md.
 */
export const PACKAGE = '@compass_agents/gateway' as const
export const ROLE = 'agent gateway / surfaces' as const

export * from './pairing'
export * from './pairing-flow'
export * from './gateway'
