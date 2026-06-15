import { expect, test } from 'bun:test'
import {
  type FetchImpl,
  buildDelegatedPayment,
  decodePaymentHeader,
  encodePaymentHeader,
  parsePaymentRequired,
  wrapFetchWithPayment,
} from './client'
import type { PaymentRequirements } from './types'

const reqs: PaymentRequirements = {
  scheme: 'exact',
  network: 'base',
  maxAmountRequired: '10000',
  payTo: '0xpay0000000000000000000000000000000000000',
  asset: '0xusdc000000000000000000000000000000000000',
}

test('parsePaymentRequired reads the accepts array', () => {
  const pr = parsePaymentRequired({ x402Version: 1, accepts: [reqs] })
  expect(pr?.accepts[0]?.network).toBe('base')
})

test('parsePaymentRequired returns null for non-402 bodies', () => {
  expect(parsePaymentRequired({ hello: 'world' })).toBeNull()
})

test('delegated payment payload round-trips through the header', () => {
  const payload = buildDelegatedPayment(reqs, {
    delegationManager: '0xdm00000000000000000000000000000000000000',
    permissionContext: [],
    delegator: '0xdelegator00000000000000000000000000000000',
  })
  expect(payload.scheme).toBe('erc7710')
  const header = encodePaymentHeader(payload)
  expect(decodePaymentHeader(header)).toEqual(payload)
})

test('wrapFetchWithPayment pays a 402 then retries to 200', async () => {
  const captured: { calls: number; paymentHeader: string | null } = {
    calls: 0,
    paymentHeader: null,
  }
  const fetchImpl = ((_input: Parameters<FetchImpl>[0], init?: RequestInit) => {
    captured.calls += 1
    if (captured.calls === 1) {
      return Promise.resolve(
        new Response(JSON.stringify({ x402Version: 1, accepts: [reqs] }), { status: 402 }),
      )
    }
    captured.paymentHeader = new Headers(init?.headers).get('X-PAYMENT')
    return Promise.resolve(new Response('paid content', { status: 200 }))
  }) as unknown as FetchImpl

  const wrapped = wrapFetchWithPayment(() => 'PAYMENT_TOKEN', { fetchImpl })
  const res = await wrapped('https://api/paid')
  expect(res.status).toBe(200)
  expect(await res.text()).toBe('paid content')
  expect(captured.calls).toBe(2)
  expect(captured.paymentHeader).toBe('PAYMENT_TOKEN')
})

test('wrapFetchWithPayment passes through a non-402 response', async () => {
  const fetchImpl = (() =>
    Promise.resolve(new Response('ok', { status: 200 }))) as unknown as FetchImpl
  const wrapped = wrapFetchWithPayment(() => 'X', { fetchImpl })
  const res = await wrapped('https://api/free')
  expect(res.status).toBe(200)
})
