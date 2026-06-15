import type { Delegation } from '@compass_agents/delegation'
import type { Hex } from 'viem'

/** One acceptable way to pay, from a 402 response. */
export interface PaymentRequirements {
  scheme: string
  network: string
  /** v1 field. */
  maxAmountRequired?: string
  /** v2 field. */
  amount?: string
  resource?: string
  payTo?: Hex
  asset?: Hex
  maxTimeoutSeconds?: number
  /** scheme-specific (EIP-712 domain {name,version} for the exact scheme). */
  extra?: Record<string, unknown>
}

/** The body/headers of an HTTP 402 Payment Required. */
export interface PaymentRequired {
  x402Version: number
  accepts: PaymentRequirements[]
  error?: string
}

/**
 * x402 payment authorised by an ERC-7710 delegation. The agent spends from a
 * delegated allowance; the facilitator settles by redeeming the delegation.
 * `permissionContext` is opaque to the facilitator (it simulates the redeem).
 */
export interface DelegatedPaymentPayload {
  x402Version: number
  scheme: 'erc7710'
  network: string
  payload: {
    delegationManager: Hex
    permissionContext: Delegation[] | Hex
    delegator: Hex
  }
}

export const DEFAULT_PAYMENT_HEADER = 'X-PAYMENT'
