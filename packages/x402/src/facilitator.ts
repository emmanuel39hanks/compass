import type { Hex } from 'viem'
import type { DelegatedPaymentPayload } from './types'

export interface VerifyResult {
  ok: boolean
  reason?: string
}

export interface SettleResult {
  txHash: Hex
}

/**
 * Dependencies a 7710 facilitator needs. `simulate` checks the intended
 * `redeemDelegations` would succeed within the delegation's caveats (the
 * permissionContext is opaque, so verification is by simulation, not by
 * signature). `settle` actually relays it — in compass, via the 1Shot relayer.
 */
export interface FacilitatorDeps {
  simulate: (payment: DelegatedPaymentPayload) => Promise<boolean>
  settle: (payment: DelegatedPaymentPayload) => Promise<Hex>
}

/**
 * x402 facilitator backed by ERC-7710 redemption. Plugs the delegation
 * settlement path into the standard x402 /verify + /settle interface.
 * See docs/INTEGRATIONS.md#x402.
 */
export class X402Facilitator {
  constructor(private readonly deps: FacilitatorDeps) {}

  async verify(payment: DelegatedPaymentPayload): Promise<VerifyResult> {
    if (payment.scheme !== 'erc7710') return { ok: false, reason: 'unsupported scheme' }
    try {
      const ok = await this.deps.simulate(payment)
      return ok ? { ok: true } : { ok: false, reason: 'simulation failed (out of caveats?)' }
    } catch (err) {
      return { ok: false, reason: (err as Error).message }
    }
  }

  async settle(payment: DelegatedPaymentPayload): Promise<SettleResult> {
    const verdict = await this.verify(payment)
    if (!verdict.ok) throw new Error(`cannot settle: ${verdict.reason}`)
    return { txHash: await this.deps.settle(payment) }
  }
}
