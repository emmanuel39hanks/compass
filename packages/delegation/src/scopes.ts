import { ScopeType } from '@metamask/smart-accounts-kit'
import type { Address } from 'viem'

/**
 * Typed factories for the delegation scopes compass uses. A scope is the
 * high-level spend constraint; the SDK turns it into the matching on-chain
 * caveat enforcer(s) at delegation time.
 */

export interface Erc20PeriodScopeInput {
  tokenAddress: Address
  /** Max transferable per period, in token base units. */
  periodAmount: bigint
  /** Period length in seconds (e.g. 86_400 for daily). */
  periodDuration: number
  /** Unix seconds the first period starts. */
  startDate: number
}

export function erc20PeriodTransfer(input: Erc20PeriodScopeInput) {
  return { type: ScopeType.Erc20PeriodTransfer, ...input } as const
}

export interface NativePeriodScopeInput {
  periodAmount: bigint
  periodDuration: number
  startDate: number
}

export function nativeTokenPeriodTransfer(input: NativePeriodScopeInput) {
  return { type: ScopeType.NativeTokenPeriodTransfer, ...input } as const
}

/** Union of the scope shapes compass produces; assignable to the SDK ScopeConfig. */
export type Scope =
  | ReturnType<typeof erc20PeriodTransfer>
  | ReturnType<typeof nativeTokenPeriodTransfer>
