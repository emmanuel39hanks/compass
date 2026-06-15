export type { PairingStore } from './pairing'

export interface PairingMessageOpts {
  code: string
  surface: string
  agentName?: string
  /** Override the approval command hint. */
  approveCommand?: string
}

/**
 * The reply an unknown sender gets: a one-time code to hand the operator, who
 * approves it out-of-band. Until then, nothing they send reaches the brain.
 */
export function formatPairingMessage(opts: PairingMessageOpts): string {
  const cmd = opts.approveCommand ?? `compass pairing approve ${opts.surface} ${opts.code}`
  const greeting = opts.agentName
    ? `🔐 Hi! I'm ${opts.agentName} and I don't recognize you yet.`
    : "🔐 Hi! I don't recognize you yet."
  return [
    greeting,
    '',
    `Your pairing code: ${opts.code}`,
    '',
    'Send this code to my owner and ask them to approve you. They run:',
    `  ${cmd}`,
    '',
    "Once approved, send your next message and I'll respond.",
  ].join('\n')
}
