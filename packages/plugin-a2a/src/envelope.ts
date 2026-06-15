import type { Delegation } from '@compass_agents/delegation'
import type { HireGrant } from '@compass_agents/relayer-1shot'

export type A2AMessageKind = 'request' | 'grant' | 'revoke' | 'result'

/**
 * The unit of A2A coordination. The payload that matters is the authority — a
 * signed (re)delegation or a full hire grant. The transport is incidental; the
 * authority is the data.
 */
export interface A2AEnvelope {
  from: string
  to: string
  kind: A2AMessageKind
  /** Present on `request`/`result`. */
  task?: string
  /** Present on `grant`/`revoke`: the (re)delegation being passed or pulled. */
  delegation?: Delegation
  /** Present on a hire `grant`: the full signed grant (root + 7702 auth + work). */
  grant?: HireGrant
  /** Present on `result`. */
  result?: string
  /** Free-form note (e.g. a budget hint on a request). */
  note?: string
}
