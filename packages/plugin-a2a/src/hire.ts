import {
  type HireGrant,
  type HireGrantOpts,
  type HireRedeemOpts,
  type RelayResult,
  hireGrantFromOwner,
  hireRedeemAsPeer,
} from '@compass_agents/relayer-1shot'
import type { Address, Hex } from 'viem'
import type { Transport } from './bus'

/**
 * The hire handshake over a real transport:
 *
 *   owner ──grant(root + 7702 auth + work)──▶ helper
 *   owner ◀──────result(taskId, status)────── helper   (helper redeemed on-chain)
 *
 * The owner builds a budget-scoped grant and ships it; the helper redeems it via
 * 1Shot — the action runs *as the owner*, bounded by the budget. Both on-chain
 * halves are injectable so the protocol is testable without a chain.
 */

export type GrantBuilder = (opts: HireGrantOpts) => Promise<HireGrant>
export type Redeemer = (opts: HireRedeemOpts) => Promise<RelayResult>

export interface SendHireOpts {
  transport: Transport
  /** This agent's handle. */
  from: string
  /** The helper's handle (routing). */
  to: string
  /** The helper's on-chain account (the delegate of the budget). */
  helperAccount: Address
  ownerKey: Hex
  task: string
  /** USDC recipient + amount (base units). */
  recipient: Address
  amount: bigint
  chainId: number
  endpoint: string
  rpcUrl?: string
  /** Override the on-chain grant builder (tests). */
  buildGrant?: GrantBuilder
}

/** Owner side: build a budget-scoped grant and ship it to the helper. */
export async function sendHire(opts: SendHireOpts): Promise<HireGrant> {
  const build = opts.buildGrant ?? hireGrantFromOwner
  const grant = await build({
    ownerKey: opts.ownerKey,
    peerAccount: opts.helperAccount,
    chainId: opts.chainId,
    endpoint: opts.endpoint,
    to: opts.recipient,
    amount: opts.amount,
    ...(opts.rpcUrl ? { rpcUrl: opts.rpcUrl } : {}),
  })
  await opts.transport.send({ from: opts.from, to: opts.to, kind: 'grant', task: opts.task, grant })
  return grant
}

export interface ServeHireOpts {
  transport: Transport
  /** This agent's handle. */
  self: string
  peerKey: Hex
  endpoint: string
  rpcUrl?: string
  /** Override the on-chain redeemer (tests). */
  redeem?: Redeemer
  /** Optional accept policy — return false to decline a grant. */
  accept?: (grant: HireGrant, from: string, task?: string) => boolean | Promise<boolean>
  onResult?: (info: { from: string; task?: string; result: RelayResult }) => void
}

/**
 * Helper side: on an incoming hire `grant`, redeem it on-chain and reply with the
 * result. Returns an unsubscribe fn. The helper can never exceed the owner's
 * budget — the caveat is enforced on-chain by the DelegationManager.
 */
export function serveHire(opts: ServeHireOpts): () => void {
  const redeem = opts.redeem ?? hireRedeemAsPeer
  return opts.transport.subscribe(opts.self, async envelope => {
    if (envelope.kind !== 'grant' || !envelope.grant) return
    if (opts.accept && !(await opts.accept(envelope.grant, envelope.from, envelope.task))) {
      await opts.transport.send({
        from: opts.self,
        to: envelope.from,
        kind: 'result',
        ...(envelope.task ? { task: envelope.task } : {}),
        result: JSON.stringify({ declined: true }),
      })
      return
    }
    const result = await redeem({
      peerKey: opts.peerKey,
      grant: envelope.grant,
      endpoint: opts.endpoint,
      ...(opts.rpcUrl ? { rpcUrl: opts.rpcUrl } : {}),
    })
    await opts.transport.send({
      from: opts.self,
      to: envelope.from,
      kind: 'result',
      ...(envelope.task ? { task: envelope.task } : {}),
      result: JSON.stringify(result),
    })
    opts.onResult?.({
      from: envelope.from,
      ...(envelope.task ? { task: envelope.task } : {}),
      result,
    })
  })
}

/**
 * Owner side: wait for the helper's `result` reply (a hire is async — the helper
 * redeems on its own machine). Resolves with the parsed RelayResult or rejects
 * on timeout. Subscribe BEFORE calling {@link sendHire}.
 */
export function awaitHireResult(
  transport: Transport,
  self: string,
  helper: string,
  timeoutMs = 90_000,
): Promise<RelayResult> {
  return new Promise<RelayResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub()
      reject(new Error(`hire result from "${helper}" timed out`))
    }, timeoutMs)
    const unsub = transport.subscribe(self, envelope => {
      if (envelope.kind !== 'result' || envelope.from !== helper || !envelope.result) return
      clearTimeout(timer)
      unsub()
      const parsed = JSON.parse(envelope.result) as RelayResult & { declined?: boolean }
      if (parsed.declined) reject(new Error(`"${helper}" declined the hire`))
      else resolve(parsed)
    })
  })
}
