import { expect, test } from 'bun:test'
import { createBudgetDelegation, parseBudget, tokenAddress, tokenDecimals } from './budget'
import { ROOT_AUTHORITY } from './delegation'
import { getSmartAccountsEnvironment } from './env'

test('parseBudget reads amount/token/period', () => {
  expect(parseBudget('25 USDC/week')).toEqual({ amount: '25', token: 'USDC', period: 'week' })
  expect(parseBudget('0.5 usdc / day')).toEqual({ amount: '0.5', token: 'USDC', period: 'day' })
})

test('parseBudget rejects garbage', () => {
  expect(() => parseBudget('lots of money')).toThrow(/invalid budget/)
  expect(() => parseBudget('25 USDC/fortnight')).toThrow()
})

test('tokenAddress + decimals for USDC', () => {
  expect(tokenAddress('USDC', 84_532)).toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e')
  expect(tokenDecimals('USDC')).toBe(6)
  expect(() => tokenAddress('USDC', 999)).toThrow()
})

test('createBudgetDelegation builds a root budget delegation', () => {
  const env = getSmartAccountsEnvironment(84_532)
  const A = '0x1111111111111111111111111111111111111111' as const
  const B = '0x2222222222222222222222222222222222222222' as const
  const d = createBudgetDelegation({
    environment: env,
    owner: A,
    agent: B,
    spec: parseBudget('25 USDC/week'),
    chainId: 84_532,
    startDate: 1_700_000_000,
    salt: `0x${'0'.repeat(63)}1`,
  })
  expect(d.delegate.toLowerCase()).toBe(B)
  expect(d.delegator.toLowerCase()).toBe(A)
  expect(d.authority.toLowerCase()).toBe(ROOT_AUTHORITY.toLowerCase())
  expect(d.caveats.length).toBeGreaterThan(0)
})
