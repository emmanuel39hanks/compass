import type { CompassConfig } from '@compass_agents/core'

export interface StatusInfo {
  smartAccount?: string
  operator?: string
  nativeBalance?: string
  usdcBalance?: string
  budgetRemaining?: string
}

/** Render a human status block from config + (optional) live balances. */
export function renderStatus(config: CompassConfig, info: StatusInfo = {}): string {
  const id = config.identity
  const name = id.agentName ?? '(unnamed)'
  const tag = id.agentId ? ` #${id.agentId}` : ''
  const budget = config.budget
    ? `${config.budget.amount} ${config.budget.token} / ${config.budget.period}`
    : '(none)'
  const lines = [
    `agent      ${name}${tag}`,
    `account    ${info.smartAccount ?? id.smartAccount ?? '(not created)'}`,
    `network    ${config.network.name ?? String(config.network.chainId)}`,
    `signer     ${id.signerSource}`,
    `brain      ${config.brain.model}`,
    `budget     ${budget}`,
  ]
  if (info.usdcBalance) lines.push(`usdc       ${info.usdcBalance}`)
  if (info.budgetRemaining) lines.push(`remaining  ${info.budgetRemaining}`)
  lines.push(`approvals  ${config.approvals.mode}`)
  return lines.join('\n')
}
