import { expect, test } from 'bun:test'
import { X402Facilitator } from './facilitator'
import type { DelegatedPaymentPayload } from './types'

const payment: DelegatedPaymentPayload = {
  x402Version: 1,
  scheme: 'erc7710',
  network: 'base',
  payload: {
    delegationManager: '0xdm00000000000000000000000000000000000000',
    permissionContext: [],
    delegator: '0xdelegator00000000000000000000000000000000',
  },
}

const TX = `0x${'a'.repeat(64)}` as const

test('verify passes when the redeem simulates successfully', async () => {
  const f = new X402Facilitator({
    simulate: () => Promise.resolve(true),
    settle: () => Promise.resolve(TX),
  })
  expect(await f.verify(payment)).toEqual({ ok: true })
})

test('verify fails when the simulation rejects (out of caveats)', async () => {
  const f = new X402Facilitator({
    simulate: () => Promise.resolve(false),
    settle: () => Promise.resolve(TX),
  })
  const v = await f.verify(payment)
  expect(v.ok).toBe(false)
  expect(v.reason).toContain('caveats')
})

test('verify rejects an unsupported scheme', async () => {
  const f = new X402Facilitator({
    simulate: () => Promise.resolve(true),
    settle: () => Promise.resolve(TX),
  })
  const v = await f.verify({ ...payment, scheme: 'exact' as 'erc7710' })
  expect(v.ok).toBe(false)
})

test('settle relays after a successful verify', async () => {
  const f = new X402Facilitator({
    simulate: () => Promise.resolve(true),
    settle: () => Promise.resolve(TX),
  })
  expect(await f.settle(payment)).toEqual({ txHash: TX })
})

test('settle refuses when verify fails', async () => {
  const f = new X402Facilitator({
    simulate: () => Promise.resolve(false),
    settle: () => Promise.resolve(TX),
  })
  await expect(f.settle(payment)).rejects.toThrow(/cannot settle/)
})
