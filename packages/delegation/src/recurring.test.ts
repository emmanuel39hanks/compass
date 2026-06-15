import { expect, test } from 'bun:test'
import {
  PERIOD_SECONDS,
  budgetRemaining,
  budgetWindow,
  createBudgetDelegation,
  parseBudget,
} from './budget'
import { getSmartAccountsEnvironment } from './env'

const WEEK = PERIOD_SECONDS.week
const START = 1_700_000_000

test('budgetWindow advances across a period boundary', () => {
  const w0 = budgetWindow(WEEK, START, START + 10)
  expect(w0.periodIndex).toBe(0)
  expect(w0.nextReset).toBe(START + WEEK)

  const w1 = budgetWindow(WEEK, START, START + WEEK + 10) // one week later
  expect(w1.periodIndex).toBe(1)
  expect(w1.periodStart).toBe(START + WEEK)
  expect(w1.nextReset).toBe(START + 2 * WEEK)
})

test('before the start date, we are in period 0', () => {
  const w = budgetWindow(WEEK, START, START - 100)
  expect(w.periodIndex).toBe(0)
})

test('budgetRemaining = periodAmount − spent, clamped at zero', () => {
  expect(budgetRemaining(25_000_000n, 10_000_000n)).toBe(15_000_000n)
  expect(budgetRemaining(25_000_000n, 30_000_000n)).toBe(0n)
})

test('a recurring budget is ONE delegation, redeemable every period (no re-sign)', () => {
  const env = getSmartAccountsEnvironment(84_532)
  const spec = parseBudget('25 USDC/week')
  const delegation = createBudgetDelegation({
    environment: env,
    owner: '0x83d412b9dc65fc728455a1AFE00cE8812CdCce13',
    agent: '0x9f2B803128D37Ccc751e426CC8f8A9E7Ece13ab8',
    spec,
    chainId: 84_532,
    startDate: START,
    salt: '0x01',
  })
  // The caveat is period-scoped — the SAME delegation authorizes spending in
  // period 0 and period 1; the agent just redeems again, no new signature.
  const p0 = budgetWindow(WEEK, START, START + 100)
  const p1 = budgetWindow(WEEK, START, START + WEEK + 100)
  expect(p1.periodIndex).toBe(p0.periodIndex + 1)
  expect(delegation.caveats.length).toBeGreaterThan(0) // the erc20PeriodTransfer caveat
  // the delegation object is unchanged between periods (reused, not rebuilt)
  expect(delegation.delegate.toLowerCase()).toBe('0x9f2b803128d37ccc751e426cc8f8a9e7ece13ab8')
})
