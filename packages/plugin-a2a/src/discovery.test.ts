import { expect, test } from 'bun:test'
import { buildAgentCard } from '@compass_agents/delegation'
import type { PublicClient } from 'viem'
import { generatePrivateKey } from 'viem/accounts'
import { publicKeyFor } from './crypto'
import { registryResolver } from './discovery'

const HELPER = '0x9f2B803128D37Ccc751e426CC8f8A9E7Ece13ab8' as const
const helperKey = generatePrivateKey()
const helperPub = publicKeyFor(helperKey)

/** A mock registry client: `resolve` → (agentId, owner); `records` → record. */
function mockClient(record: { account: string; pubkey: string; cardURI: string }): PublicClient {
  return {
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === 'resolve') return [1n, HELPER]
      if (functionName === 'records') return [record.account, record.pubkey, record.cardURI]
      throw new Error(`unexpected call ${functionName}`)
    },
  } as unknown as PublicClient
}

test('resolves a peer by handle: on-chain pubkey + AgentCard endpoint', async () => {
  const client = mockClient({
    account: HELPER,
    pubkey: helperPub,
    cardURI: 'https://compass.app/a/helper/card.json',
  })
  const card = { ...buildAgentCard({ name: 'helper' }), url: 'http://127.0.0.1:4310' }
  const fetchImpl = (async () => new Response(JSON.stringify(card))) as unknown as typeof fetch

  const resolve = registryResolver({ client, registry: HELPER, fetchImpl })
  const peer = await resolve('helper')
  expect(peer).toEqual({ name: 'helper', endpoint: 'http://127.0.0.1:4310', pubkey: helperPub })
})

test('endpointFor override skips the card fetch (local demos)', async () => {
  const client = mockClient({ account: HELPER, pubkey: helperPub, cardURI: '' })
  const resolve = registryResolver({
    client,
    registry: HELPER,
    endpointFor: () => 'http://localhost:9999',
  })
  const peer = await resolve('helper')
  expect(peer?.endpoint).toBe('http://localhost:9999')
  expect(peer?.pubkey).toBe(helperPub)
})

test('a peer with no published pubkey is unresolvable', async () => {
  const client = mockClient({ account: HELPER, pubkey: '0x', cardURI: 'https://x' })
  const resolve = registryResolver({ client, registry: HELPER })
  expect(await resolve('helper')).toBeUndefined()
})

test('memoizes resolved peers (one chain read, then cache)', async () => {
  let reads = 0
  const client = {
    readContract: async ({ functionName }: { functionName: string }) => {
      reads++
      if (functionName === 'resolve') return [1n, HELPER]
      return [HELPER, helperPub, '']
    },
  } as unknown as PublicClient
  const resolve = registryResolver({ client, registry: HELPER, endpointFor: () => 'http://x' })
  await resolve('helper')
  const before = reads
  await resolve('helper')
  expect(reads).toBe(before) // served from cache, no extra reads
})
