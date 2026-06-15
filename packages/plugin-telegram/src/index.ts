/**
 * @compass_agents/plugin-telegram — text your agent from Telegram. Raw Bot API client,
 * a long-poll listener that routes through the gateway, pairing, inline-keyboard
 * approvals, MarkdownV2 + chunking. See docs/plan/05-reach.md.
 */
export const PACKAGE = '@compass_agents/plugin-telegram' as const
export const ROLE = 'telegram surface' as const

export * from './chunking'
export * from './markdown'
export * from './approval-keyboard'
export * from './client'
export * from './listener'
