import { expect, test } from 'bun:test'
import type { ToolContext } from '@compass_agents/core'
import { makeDiscoveryTools } from './discovery-tools'

const ctx = (): ToolContext => ({ memory: undefined as never })

const CATALOG = {
  items: [
    {
      resource: 'https://data.example/prices',
      accepts: [{ network: 'base', maxAmountRequired: '10000', description: 'price data' }],
    },
  ],
}

test('discover lists services from the bazaar', async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify(CATALOG), { status: 200 })) as unknown as typeof fetch
  const [discover] = makeDiscoveryTools({ url: 'https://fake/discovery', fetchImpl })
  const r = await discover!.run({ query: 'price' }, ctx())
  expect(r.ok).toBe(true)
  expect(r.content).toContain('https://data.example/prices')
  expect(r.content).toContain('0.01 USDC')
})

test('discover fails soft when the catalog is unreachable', async () => {
  const fetchImpl = (async () => new Response('x', { status: 500 })) as unknown as typeof fetch
  const [discover] = makeDiscoveryTools({ fetchImpl })
  const r = await discover!.run({}, ctx())
  expect(r.ok).toBe(false)
  expect(r.content).toContain('discovery unavailable')
})
