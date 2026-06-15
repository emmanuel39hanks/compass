/**
 * @compass_agents/core — chain-agnostic agent harness.
 *
 * Brain interface, tool registry, events/runtime loop, approval gates, local
 * memory store, and config — chain-agnostic, no provider lock-in.
 * See docs/ARCHITECTURE.md.
 */
export const PACKAGE = '@compass_agents/core' as const
export const ROLE = 'agent harness core' as const

export * from './brain/types'
export * from './brain/stub'
export * from './tools/types'
export * from './tools/registry'
export * from './events/types'
export * from './permission/approvals'
export * from './memory/store'
export * from './memory/scan'
export * from './memory/activity'
export * from './memory/export'
export * from './memory/compaction'
export * from './wallet/keystore'
export * from './runtime/loop'
export * from './config'
