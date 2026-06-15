import { expect, test } from 'bun:test'
import type { ToolContext } from '@compass_agents/core'
import { makeOnchainTools } from './onchain'

const ACCT = '0x1111111111111111111111111111111111111111' as const

test('chain.balance formats USDC', async () => {
  const balance = makeOnchainTools({
    account: ACCT,
    readUsdcBalance: () => Promise.resolve(1_500_000n),
    sendUsdc: () => Promise.resolve({ taskId: '0x', status: 200 }),
  })[0]!
  const r = await balance.run({}, {} as ToolContext)
  expect(r.content).toBe('1.5 USDC')
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
