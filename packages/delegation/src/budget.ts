import { type Address, parseUnits } from 'viem'
import { type Delegation, rootDelegation } from './delegation'
import type { SmartAccountsEnvironment } from './env'
import { erc20PeriodTransfer } from './scopes'

/**
 * A spending budget expressed in plain terms — "25 USDC / week". This is the
 * authority an owner grants their agent. On the wire it becomes a root
 * delegation with an `erc20PeriodTransfer` caveat (auto-resetting each period).
 */
export interface BudgetSpec {
  amount: string
  token: string
  period: 'day' | 'week' | 'month'
}

export const PERIOD_SECONDS: Record<BudgetSpec['period'], number> = {
  day: 86_400,
  week: 604_800,
  month: 2_592_000,
}

/** Known USDC token addresses by chain (the default budget token). */
export const USDC_BY_CHAIN: Record<number, Address> = {
  84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base mainnet
}

const DECIMALS: Record<string, number> = { USDC: 6, USDT: 6, USDG: 6, DAI: 18 }

/** Parse "25 USDC / week" (spaces optional) into a BudgetSpec. */
export function parseBudget(input: string): BudgetSpec {
  const m = input.trim().match(/^(\d+(?:\.\d+)?)\s*([A-Za-z]+)\s*\/\s*(day|week|month)$/)
  if (!m) throw new Error(`invalid budget "${input}" — expected e.g. "25 USDC/week"`)
  return {
    amount: m[1] as string,
    token: (m[2] as string).toUpperCase(),
    period: m[3] as BudgetSpec['period'],
  }
}

export function tokenDecimals(token: string): number {
  return DECIMALS[token.toUpperCase()] ?? 18
}

export interface BudgetWindow {
  /** 0-based period number since `startDate`. */
  periodIndex: number
  /** Unix seconds the current period began. */
  periodStart: number
  /** Unix seconds the allowance next resets. */
  nextReset: number
  periodDuration: number
}

/**
 * The current period of a recurring (periodic) budget. The on-chain
 * `erc20PeriodTransfer` caveat resets the allowance every `periodSeconds` from
 * `startDate` — so the SAME signed delegation is redeemable in every period with
 * **no new signature**. This is the accounting behind `compass budget`.
 */
export function budgetWindow(periodSeconds: number, startDate: number, now: number): BudgetWindow {
  const elapsed = Math.max(0, now - startDate)
  const periodIndex = Math.floor(elapsed / periodSeconds)
  const periodStart = startDate + periodIndex * periodSeconds
  return {
    periodIndex,
    periodStart,
    nextReset: periodStart + periodSeconds,
    periodDuration: periodSeconds,
  }
}

/** Remaining allowance this period = periodAmount − spentThisPeriod (clamped ≥ 0). */
export function budgetRemaining(periodAmount: bigint, spentThisPeriod: bigint): bigint {
  const left = periodAmount - spentThisPeriod
  return left > 0n ? left : 0n
}

export function tokenAddress(token: string, chainId: number): Address {
  if (token.toUpperCase() === 'USDC') {
    const addr = USDC_BY_CHAIN[chainId]
    if (!addr) throw new Error(`no USDC address known for chain ${chainId}`)
    return addr
  }
  throw new Error(`unknown budget token ${token} (only USDC mapped today)`)
}

export interface BudgetDelegationInput {
  environment: SmartAccountsEnvironment
  /** Owner / operator account that signs the grant (the delegator). */
  owner: Address
  /** The agent account that may spend within the budget (the delegate). */
  agent: Address
  spec: BudgetSpec
  chainId: number
  /** Unix seconds the first period starts (caller supplies; keep libs deterministic). */
  startDate: number
  salt: `0x${string}`
}

/**
 * Build the (unsigned) root delegation that encodes a budget. Sign it with
 * `signDelegation` (operator key) before relaying. This is the no-Flask path —
 * works today on testnet with a plain key/keystore operator.
 */
export function createBudgetDelegation(input: BudgetDelegationInput): Delegation {
  const periodAmount = parseUnits(input.spec.amount, tokenDecimals(input.spec.token))
  return rootDelegation({
    environment: input.environment,
    from: input.owner,
    to: input.agent,
    salt: input.salt,
    scope: erc20PeriodTransfer({
      tokenAddress: tokenAddress(input.spec.token, input.chainId),
      periodAmount,
      periodDuration: PERIOD_SECONDS[input.spec.period],
      startDate: input.startDate,
    }),
  })
}
