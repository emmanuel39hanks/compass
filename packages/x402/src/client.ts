import type { Delegation } from '@compass_agents/delegation'
import type { Hex } from 'viem'
import {
  DEFAULT_PAYMENT_HEADER,
  type DelegatedPaymentPayload,
  type PaymentRequired,
  type PaymentRequirements,
} from './types'

export type FetchImpl = typeof fetch

/** Parse a 402 body into PaymentRequired (tolerates v1 `accepts` shape). */
export function parsePaymentRequired(body: unknown): PaymentRequired | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (!Array.isArray(b.accepts)) return null
  return {
    x402Version: typeof b.x402Version === 'number' ? b.x402Version : 1,
    accepts: b.accepts as PaymentRequirements[],
    ...(typeof b.error === 'string' ? { error: b.error } : {}),
  }
}

/** Build the ERC-7710 (delegated allowance) payment payload. */
export function buildDelegatedPayment(
  requirements: PaymentRequirements,
  args: { delegationManager: Hex; permissionContext: Delegation[] | Hex; delegator: Hex },
  x402Version = 1,
): DelegatedPaymentPayload {
  return {
    x402Version,
    scheme: 'erc7710',
    network: requirements.network,
    payload: {
      delegationManager: args.delegationManager,
      permissionContext: args.permissionContext,
      delegator: args.delegator,
    },
  }
}

/** Encode a payment payload as the base64 header value clients send back. */
export function encodePaymentHeader(payload: DelegatedPaymentPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
}

export function decodePaymentHeader(value: string): DelegatedPaymentPayload {
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as DelegatedPaymentPayload
}

/** Given the 402 requirements, produce the payment header value. */
export type PaymentBuilder = (requirements: PaymentRequirements) => Promise<string> | string

export interface WrapFetchOpts {
  header?: string
  fetchImpl?: FetchImpl
}

export interface PayFetchDeps {
  delegationManager: Hex
  /** The agent's budget delegation chain (or its encoded context). */
  permissionContext: Delegation[] | Hex
  /** The delegator (owner) whose budget is spent. */
  delegator: Hex
  x402Version?: number
  fetchImpl?: FetchImpl
  header?: string
}

/**
 * A fetch that pays x402 paywalls from a delegated budget: on a 402, it presents
 * the agent's ERC-7710 budget delegation as the payment, and the facilitator
 * settles by redeeming it. The agent spends its allowance, never its own funds.
 */
export function payFetch(deps: PayFetchDeps): FetchImpl {
  return wrapFetchWithPayment(
    requirements =>
      encodePaymentHeader(
        buildDelegatedPayment(
          requirements,
          {
            delegationManager: deps.delegationManager,
            permissionContext: deps.permissionContext,
            delegator: deps.delegator,
          },
          deps.x402Version,
        ),
      ),
    {
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      ...(deps.header ? { header: deps.header } : {}),
    },
  )
}

/**
 * Wrap fetch so a 402 is transparently handled: parse requirements, build a
 * payment, and retry once with the payment header. Mirrors @x402/fetch but lets
 * the payment be authorised by an ERC-7710 delegation.
 */
export function wrapFetchWithPayment(build: PaymentBuilder, opts: WrapFetchOpts = {}): FetchImpl {
  const header = opts.header ?? DEFAULT_PAYMENT_HEADER
  const f = opts.fetchImpl ?? fetch
  return (async (input: Parameters<FetchImpl>[0], init?: RequestInit) => {
    const first = await f(input, init)
    if (first.status !== 402) return first
    const required = parsePaymentRequired(
      await first
        .clone()
        .json()
        .catch(() => null),
    )
    const requirements = required?.accepts[0]
    if (!requirements) return first
    const headerValue = await build(requirements)
    const headers = new Headers(init?.headers)
    headers.set(header, headerValue)
    return f(input, { ...init, headers })
  }) as FetchImpl
}
