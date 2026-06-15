import { expect, test } from 'bun:test'
import { type FetchImpl, OneShotRelayer, buildSend7710Params } from './client'
import type { Send7710Input } from './types'

function rpcResponse(result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status: 200 })
}

const sampleInput: Send7710Input = {
  chainId: 8453,
  permissionContext: [],
  executions: [{ target: '0xfee0000000000000000000000000000000000000', value: '0', data: '0x' }],
  authorizationList: [
    {
      address: '0x7702000000000000000000000000000000000000',
      chainId: '8453',
      nonce: '0',
      r: '0x01',
      s: '0x02',
      yParity: '0',
    },
  ],
  destinationUrl: 'https://app/webhook',
  memo: 'order-1',
}

test('buildSend7710Params shapes the request', () => {
  const p = buildSend7710Params(sampleInput)
  expect(p.chainId).toBe('8453')
  expect(Array.isArray(p.transactions)).toBe(true)
  expect(p.authorizationList).toBeDefined()
  expect(p.memo).toBe('order-1')
})

test('buildSend7710Params omits optional fields when absent', () => {
  const p = buildSend7710Params({ chainId: 1, permissionContext: [], executions: [] })
  expect(p.authorizationList).toBeUndefined()
  expect(p.memo).toBeUndefined()
})

test('getCapabilities sends stringified chain ids', async () => {
  let body: { method?: string; params?: unknown } = {}
  const fetchImpl = ((_u: string, init: RequestInit) => {
    body = JSON.parse(String(init.body))
    return Promise.resolve(
      rpcResponse({ '8453': { feeCollector: '0x', targetAddress: '0x', tokens: [] } }),
    )
  }) as unknown as FetchImpl
  const relayer = new OneShotRelayer({ fetchImpl })
  await relayer.getCapabilities([8453])
  expect(body.method).toBe('relayer_getCapabilities')
  expect(body.params).toEqual(['8453'])
})

test('send7710 returns the TaskId', async () => {
  const fetchImpl = (() =>
    Promise.resolve(rpcResponse(`0x${'a'.repeat(64)}`))) as unknown as FetchImpl
  const relayer = new OneShotRelayer({ fetchImpl })
  const taskId = await relayer.send7710(sampleInput)
  expect(taskId).toMatch(/^0x[a]{64}$/)
})

test('rpc surfaces relayer errors', async () => {
  const fetchImpl = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: 4210, message: 'too many auths' } }),
        {
          status: 200,
        },
      ),
    )) as unknown as FetchImpl
  const relayer = new OneShotRelayer({ fetchImpl })
  await expect(relayer.getStatus('0xabc')).rejects.toThrow(/4210/)
})
