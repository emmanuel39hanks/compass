import { afterAll, expect, test } from 'bun:test'
import { buildAgentCard } from '@compass_agents/delegation'
import { generatePrivateKey } from 'viem/accounts'
import { publicKeyFor } from './crypto'
import type { A2AEnvelope } from './envelope'
import { type HttpPeer, HttpTransport, fetchAgentCard, serveAgent } from './http'

const aliceKey = generatePrivateKey()
const bobKey = generatePrivateKey()
const peers: Record<string, HttpPeer> = {}
const resolve = (n: string) => peers[n]

const alice = new HttpTransport({ selfName: 'alice', selfKey: aliceKey, resolvePeer: resolve })
const bob = new HttpTransport({ selfName: 'bob', selfKey: bobKey, resolvePeer: resolve })
const aliceSrv = serveAgent({ transport: alice, card: buildAgentCard({ name: 'alice' }), port: 0 })
const bobSrv = serveAgent({ transport: bob, card: buildAgentCard({ name: 'bob' }), port: 0 })
peers.alice = { name: 'alice', endpoint: aliceSrv.url, pubkey: publicKeyFor(aliceKey) }
peers.bob = { name: 'bob', endpoint: bobSrv.url, pubkey: publicKeyFor(bobKey) }

afterAll(() => {
  aliceSrv.stop()
  bobSrv.stop()
})

test('a sealed envelope round-trips over real HTTP and decrypts at the peer', async () => {
  let got: A2AEnvelope | undefined
  const unsub = bob.subscribe('bob', e => {
    got = e
  })
  await alice.send({
    from: 'alice',
    to: 'bob',
    kind: 'request',
    task: 'fetch a price',
    note: 'budget 1',
  })
  expect(got).toMatchObject({ from: 'alice', to: 'bob', kind: 'request', task: 'fetch a price' })
  unsub()
})

test('AgentCard is discoverable at /.well-known/agent-card.json', async () => {
  const card = await fetchAgentCard(aliceSrv.url)
  expect(card.name).toBe('alice')
  expect(card.protocolVersion).toBe('0.3.0')
  expect(card.skills.map(s => s.id)).toContain('hire')
})

test('a spoofed sender (wrong key) is rejected by the receiver', async () => {
  const mallory = new HttpTransport({
    selfName: 'alice', // claims to be alice
    selfKey: generatePrivateKey(), // but holds a different key
    resolvePeer: resolve,
  })
  await expect(
    mallory.send({ from: 'alice', to: 'bob', kind: 'request', task: 'steal' }),
  ).rejects.toThrow(/HTTP 400/)
})

test('routing to an unknown peer throws before any network call', async () => {
  await expect(alice.send({ from: 'alice', to: 'nobody', kind: 'request' })).rejects.toThrow(
    /unknown peer/,
  )
})
