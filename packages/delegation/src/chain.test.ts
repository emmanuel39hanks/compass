import { expect, test } from 'bun:test'
import { assertChainLinks, linkChain } from './chain'
import { redelegate, rootDelegation } from './delegation'
import { getSmartAccountsEnvironment } from './env'
import { erc20PeriodTransfer } from './scopes'

const env = getSmartAccountsEnvironment(11155111)
const A = '0x1111111111111111111111111111111111111111' as const
const B = '0x2222222222222222222222222222222222222222' as const
const C = '0x3333333333333333333333333333333333333333' as const
const SALT = `0x${'0'.repeat(63)}2` as const
const scope = erc20PeriodTransfer({
  tokenAddress: '0x4444444444444444444444444444444444444444',
  periodAmount: 10n,
  periodDuration: 3600,
  startDate: 1_700_000_000,
})

const root = rootDelegation({ environment: env, from: A, to: B, scope, salt: SALT })
const child = redelegate({ environment: env, from: B, to: C, parent: root, salt: SALT })

test('linkChain validates a correct leaf->root chain', () => {
  const chain = linkChain(child, root)
  expect(chain).toHaveLength(2)
  expect(chain[0]).toBe(child)
  expect(chain[1]).toBe(root)
})

test('assertChainLinks rejects a tampered authority', () => {
  const bad = { ...child, authority: `0x${'d'.repeat(64)}` as const }
  expect(() => assertChainLinks([bad, root])).toThrow(/broken link/)
})

test('assertChainLinks requires ROOT_AUTHORITY at the root', () => {
  // `child` alone: its authority is hash(root), not ROOT_AUTHORITY.
  expect(() => assertChainLinks([child])).toThrow(/ROOT_AUTHORITY/)
})

test('assertChainLinks rejects an empty chain', () => {
  expect(() => assertChainLinks([])).toThrow(/empty/)
})
