import { expect, test } from 'bun:test'
import { linkChain } from './chain'
import { redelegate, rootDelegation } from './delegation'
import { getSmartAccountsEnvironment } from './env'
import { encodeDisable, encodeRedeem, execution } from './redeem'
import { erc20PeriodTransfer } from './scopes'

const env = getSmartAccountsEnvironment(11155111)
const A = '0x1111111111111111111111111111111111111111' as const
const B = '0x2222222222222222222222222222222222222222' as const
const C = '0x3333333333333333333333333333333333333333' as const
const USDC = '0x4444444444444444444444444444444444444444' as const
const SALT = `0x${'0'.repeat(63)}3` as const
const scope = erc20PeriodTransfer({
  tokenAddress: USDC,
  periodAmount: 10n,
  periodDuration: 3600,
  startDate: 1_700_000_000,
})

const root = rootDelegation({ environment: env, from: A, to: B, scope, salt: SALT })
const child = redelegate({ environment: env, from: B, to: C, parent: root, salt: SALT })

test('encodeRedeem produces redeemDelegations calldata', () => {
  const chain = linkChain(child, root)
  const data = encodeRedeem(chain, [execution({ target: USDC })])
  expect(data.startsWith('0x')).toBe(true)
  expect(data.length).toBeGreaterThan(10)
})

test('encodeDisable produces revocation calldata', () => {
  const data = encodeDisable(root)
  expect(data.startsWith('0x')).toBe(true)
  expect(data.length).toBeGreaterThan(10)
})
