import { afterAll, expect, test } from 'bun:test'
import type { Hex } from 'viem'
import {
  buildDelegatedPayment,
  encodePaymentHeader,
  parsePaymentRequired,
  payFetch,
} from './client'
import { X402Facilitator } from './facilitator'
import { handleX402, serveX402 } from './server'
import type { PaymentRequirements } from './types'

const requirements: PaymentRequirements = {
  scheme: 'erc7710',
  network: 'base-sepolia',
  maxAmountRequired: '10000', // 0.01 USDC
  resource: 'https://api.example.com/price',
  payTo: '0x1111111111111111111111111111111111111111',
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
}

const DM = '0x2222222222222222222222222222222222222222' as Hex
const DELEGATOR = '0x3333333333333333333333333333333333333333' as Hex
const samplePayment = encodePaymentHeader(
  buildDelegatedPayment(requirements, {
    delegationManager: DM,
    permissionContext: '0xabcd',
    delegator: DELEGATOR,
  }),
)

/** A facilitator whose settle always/never succeeds, recording calls. */
function fakeFacilitator(ok: boolean) {
  const calls: number[] = []
  const f = new X402Facilitator({
    simulate: async () => ok,
    settle: async () => {
      calls.push(1)
      return '0xdeadbeef' as Hex
    },
  })
  return { f, calls }
}

test('no payment header → 402 with the requirements', async () => {
  const { f } = fakeFacilitator(true)
  const out = await handleX402(null, {
    requirements,
    facilitator: f,
    resource: () => ({ price: 42 }),
  })
  expect(out.status).toBe(402)
  const parsed = parsePaymentRequired(out.body)
  expect(parsed?.accepts[0]?.payTo).toBe(requirements.payTo)
})

test('valid payment → settle → 200 + resource + proof header', async () => {
  const { f, calls } = fakeFacilitator(true)
  const out = await handleX402(samplePayment, {
    requirements,
    facilitator: f,
    resource: () => ({ price: 42 }),
  })
  expect(out.status).toBe(200)
  expect(out.body).toEqual({ price: 42 })
  expect(out.headers['X-PAYMENT-RESPONSE']).toBe('0xdeadbeef')
  expect(calls.length).toBe(1)
})

test('malformed payment header → 402, no settle', async () => {
  const { f, calls } = fakeFacilitator(true)
  const out = await handleX402('not-base64-json', {
    requirements,
    facilitator: f,
    resource: () => 'x',
  })
  expect(out.status).toBe(402)
  expect(calls.length).toBe(0)
})

test('unsettleable payment (out of caveats) → 402', async () => {
  const { f } = fakeFacilitator(false)
  const out = await handleX402(samplePayment, { requirements, facilitator: f, resource: () => 'x' })
  expect(out.status).toBe(402)
})

test('real HTTP round-trip: payFetch pays the paywall and gets the resource', async () => {
  const { f, calls } = fakeFacilitator(true)
  const server = serveX402({
    requirements,
    facilitator: f,
    resource: () => ({ price: '3200.50', pair: 'ETH/USD' }),
    port: 0,
  })

  // A buyer that pays from its (fake) budget delegation.
  const pay = payFetch({ delegationManager: DM, permissionContext: '0xabcd', delegator: DELEGATOR })
  const res = await pay(server.url)
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ price: '3200.50', pair: 'ETH/USD' })
  expect(res.headers.get('X-PAYMENT-RESPONSE')).toBe('0xdeadbeef')
  expect(calls.length).toBe(1) // settled exactly once

  server.stop()
})

afterAll(() => {})
