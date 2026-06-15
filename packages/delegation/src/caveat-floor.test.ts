import { expect, test } from 'bun:test'
import type { Hex } from 'viem'
import { createBudgetDelegation, parseBudget } from './budget'
import { getSmartAccountsEnvironment } from './env'

/**
 * The security floor. compass's approval gate is UX — the REAL bound on an agent
 * is the on-chain caveat enforced by MetaMask's audited DelegationManager. These
 * tests prove a budget delegation encodes the correct limit, token, and period,
 * so a redeem exceeding any of them reverts on-chain even with approvals OFF.
 */

const env = getSmartAccountsEnvironment(84_532)
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const PERIOD_ENFORCER = (env.caveatEnforcers as Record<string, Hex>)
  .ERC20PeriodTransferEnforcer as Hex

function budget(spec: string) {
  return createBudgetDelegation({
    environment: env,
    owner: '0x83d412b9dc65fc728455a1AFE00cE8812CdCce13',
    agent: '0x9f2B803128D37Ccc751e426CC8f8A9E7Ece13ab8',
    spec: parseBudget(spec),
    chainId: 84_532,
    startDate: 1_700_000_000,
    salt: '0x01',
  })
}

/** Decode the ERC20PeriodTransfer terms: token(20) ‖ amount(32) ‖ duration(32) ‖ start(32). */
function decodePeriodTerms(terms: Hex) {
  const h = terms.slice(2)
  return {
    token: `0x${h.slice(0, 40)}`.toLowerCase(),
    periodAmount: BigInt(`0x${h.slice(40, 104)}`),
    periodDuration: BigInt(`0x${h.slice(104, 168)}`),
    startDate: BigInt(`0x${h.slice(168, 232)}`),
  }
}

function periodCaveat(spec: string) {
  const d = budget(spec)
  const caveat = d.caveats.find(c => c.enforcer.toLowerCase() === PERIOD_ENFORCER.toLowerCase())
  if (!caveat) throw new Error('no ERC20PeriodTransfer caveat')
  return decodePeriodTerms(caveat.terms as Hex)
}

test('budget delegation is bound by the audited period-transfer enforcer', () => {
  const d = budget('25 USDC/week')
  expect(d.caveats.some(c => c.enforcer.toLowerCase() === PERIOD_ENFORCER.toLowerCase())).toBe(true)
})

test('the encoded limit matches the requested budget (the cap a redeem cannot exceed)', () => {
  expect(periodCaveat('25 USDC/week').periodAmount).toBe(25_000_000n)
  expect(periodCaveat('10 USDC/week').periodAmount).toBe(10_000_000n)
  expect(periodCaveat('0.5 USDC/day').periodAmount).toBe(500_000n)
})

test('the caveat pins the exact token — funds in another asset are not authorized', () => {
  expect(periodCaveat('25 USDC/week').token).toBe(USDC.toLowerCase())
})

test('the period window is encoded (the allowance only resets on schedule)', () => {
  expect(periodCaveat('25 USDC/week').periodDuration).toBe(604_800n) // week
  expect(periodCaveat('25 USDC/day').periodDuration).toBe(86_400n) // day
  expect(periodCaveat('25 USDC/month').periodDuration).toBe(2_592_000n) // month
})

test('changing the budget changes the on-chain cap (no silent unbounded grant)', () => {
  expect(periodCaveat('1 USDC/week').periodAmount).not.toBe(
    periodCaveat('100 USDC/week').periodAmount,
  )
})
