import { expect, test } from 'bun:test'
import { discoverX402Services, filterServices, normalizeDiscovery } from './bazaar'

const CATALOG = {
  items: [
    {
      resource: 'https://data.example/crypto-prices',
      accepts: [
        {
          network: 'base',
          maxAmountRequired: '10000', // 0.01 USDC
          description: 'Historical crypto price dataset (2020–2026)',
          mimeType: 'application/json',
        },
      ],
    },
    {
      accepts: [
        {
          network: 'base',
          maxAmountRequired: '50000',
          resource: 'https://api.example/weather',
          description: 'Weather forecast API',
        },
      ],
    },
    { resource: 'https://nope.example' }, // no accepts → still surfaced as free
  ],
}

test('normalizeDiscovery maps the catalog (resource, price, network)', () => {
  const s = normalizeDiscovery(CATALOG)
  expect(s).toHaveLength(3)
  expect(s[0]).toMatchObject({
    resource: 'https://data.example/crypto-prices',
    price: '0.01 USDC',
    network: 'base',
    mimeType: 'application/json',
  })
  expect(s[1]?.resource).toBe('https://api.example/weather') // pulled from accepts
  expect(s[2]?.price).toBe('free')
})

test('normalizeDiscovery tolerates a bare array', () => {
  expect(normalizeDiscovery([{ resource: 'https://x' }])[0]?.resource).toBe('https://x')
})

test('filterServices matches keyword over description + resource', () => {
  const s = normalizeDiscovery(CATALOG)
  expect(filterServices(s, 'crypto').map(x => x.resource)).toEqual([
    'https://data.example/crypto-prices',
  ])
  expect(filterServices(s, 'weather')).toHaveLength(1)
  expect(filterServices(s, undefined, 2)).toHaveLength(2) // limit
})

test('discoverX402Services fetches + filters', async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify(CATALOG), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch
  const found = await discoverX402Services({ query: 'dataset', fetchImpl })
  expect(found).toHaveLength(1)
  expect(found[0]?.resource).toBe('https://data.example/crypto-prices')
})

test('discoverX402Services throws on a bad status', async () => {
  const fetchImpl = (async () => new Response('no', { status: 500 })) as unknown as typeof fetch
  await expect(discoverX402Services({ fetchImpl })).rejects.toThrow('x402 discovery 500')
})
