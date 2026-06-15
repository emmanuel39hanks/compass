import { expect, test } from 'bun:test'
import {
  ROOT_AUTHORITY,
  delegationHash,
  randomSalt,
  redelegate,
  rootDelegation,
} from './delegation'
import { getSmartAccountsEnvironment } from './env'
import { erc20PeriodTransfer } from './scopes'

const env = getSmartAccountsEnvironment(11155111) // Sepolia
const A = '0x1111111111111111111111111111111111111111' as const
const B = '0x2222222222222222222222222222222222222222' as const
const C = '0x3333333333333333333333333333333333333333' as const
const USDC = '0x4444444444444444444444444444444444444444' as const
const SALT = `0x${'0'.repeat(63)}1` as const

const scope = erc20PeriodTransfer({
  tokenAddress: USDC,
  periodAmount: 25_000_000n,
  periodDuration: 86_400,
  startDate: 1_700_000_000,
})

test('root delegation carries ROOT_AUTHORITY and the right parties', () => {
  const d = rootDelegation({ environment: env, from: A, to: B, scope, salt: SALT })
  expect(d.authority.toLowerCase()).toBe(ROOT_AUTHORITY.toLowerCase())
  expect(d.delegator.toLowerCase()).toBe(A)
  expect(d.delegate.toLowerCase()).toBe(B)
  expect(d.caveats.length).toBeGreaterThan(0)
})

test('redelegation authority equals the hash of the parent', () => {
  const root = rootDelegation({ environment: env, from: A, to: B, scope, salt: SALT })
  const child = redelegate({ environment: env, from: B, to: C, parent: root, salt: SALT })
  expect(child.authority.toLowerCase()).toBe(delegationHash(root).toLowerCase())
  expect(child.delegator.toLowerCase()).toBe(B)
  expect(child.delegate.toLowerCase()).toBe(C)
})

test('randomSalt yields distinct 32-byte hex', () => {
  const a = randomSalt()
  const b = randomSalt()
  expect(a).toMatch(/^0x[0-9a-f]{64}$/)
  expect(a).not.toBe(b)
})
