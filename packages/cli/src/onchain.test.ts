import { expect, test } from 'bun:test'
import type { ToolContext } from '@compass_agents/core'
import { makeOnchainTools } from './onchain'

const ACCT = '0x1111111111111111111111111111111111111111' as const

test('chain.balance reports USDC + network + wallet (chain-aware)', async () => {
  const balance = makeOnchainTools({
    account: ACCT,
    network: 'Base Sepolia',
    readUsdcBalance: () => Promise.resolve(1_500_000n),
    sendUsdc: () => Promise.resolve({ taskId: '0x', status: 200 }),
  })[0]!
  const r = await balance.run({}, {} as ToolContext)
  expect(r.content).toContain('1.5 USDC')
  expect(r.content).toContain('on Base Sepolia')
  expect(r.content).toContain(ACCT)
})

test('chain.balance shows a granted MetaMask budget when present', async () => {
  const balance = makeOnchainTools({
    account: ACCT,
    network: 'Base Sepolia',
    grantedBudget: '25 USDC/week',
    readUsdcBalance: () => Promise.resolve(0n),
    sendUsdc: () => Promise.resolve({ taskId: '0x', status: 200 }),
  })[0]!
  const r = await balance.run({}, {} as ToolContext)
  expect(r.content).toContain('MetaMask budget: 25 USDC/week')
})

test('chain.send reports the relay result', async () => {
  const send = makeOnchainTools({
    account: ACCT,
    readUsdcBalance: () => Promise.resolve(0n),
    sendUsdc: () =>
      Promise.resolve({ taskId: `0x${'a'.repeat(64)}`, status: 200, hash: `0x${'b'.repeat(64)}` }),
  })[1]!
  const r = await send.run(
    { to: '0x2222222222222222222222222222222222222222', amount: '0.5' },
    {} as ToolContext,
  )
  expect(r.ok).toBe(true)
  expect(r.content).toContain('sent 0.5 USDC')
  expect(r.content).toContain('tx 0xbbbbbbbbbb')
})

test('chain.send rejects a malformed address at the schema', () => {
  const send = makeOnchainTools({
    account: ACCT,
    readUsdcBalance: () => Promise.resolve(0n),
    sendUsdc: () => Promise.resolve({ taskId: '0x', status: 200 }),
  })[1]!
  expect(send.schema.safeParse({ to: 'nope', amount: '1' }).success).toBe(false)
})

test('chain.send accepts a non-canonical EIP-55 casing (re-checksums, no throw)', async () => {
  let got: string | undefined
  const send = makeOnchainTools({
    account: ACCT,
    readUsdcBalance: () => Promise.resolve(0n),
    sendUsdc: to => {
      got = to
      return Promise.resolve({ taskId: '0x', status: 200 })
    },
  })[1]!
  // mixed-case address whose checksum is NOT canonical — viem getAddress() throws on it
  const r = await send.run(
    { to: '0xC495953DE50Ac375e3c564F4Acd4Cc48949576AE', amount: '0.1' },
    {} as ToolContext,
  )
  expect(r.ok).toBe(true) // didn't throw
  expect(got?.toLowerCase()).toBe('0xc495953de50ac375e3c564f4acd4cc48949576ae')
})
