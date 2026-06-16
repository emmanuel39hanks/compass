import { expect, test } from 'bun:test'
import type { CompassConfig, ToolContext } from '@compass_agents/core'
import type { PublicClient } from 'viem'
import { makeReputationTools } from './reputation-tools'

const ctx = (): ToolContext => ({ memory: undefined as never })

const config = (chainId: number): CompassConfig =>
  ({
    network: { chainId, rpcUrl: 'https://rpc.invalid', name: 'n' },
    identity: { signerSource: 'privkey' },
  }) as unknown as CompassConfig

test('a2a.reputation reports identity-only when no reputation registry is deployed', async () => {
  // 84532 has an identity registry but no reputation registry → graceful fallback.
  const client = {
    readContract: async () => [42n, '0xabc0000000000000000000000000000000000001'] as const,
  } as unknown as PublicClient
  const [tool] = makeReputationTools(config(84532), { client })
  const r = await tool!.run({ agent: 'scout' }, ctx())
  expect(r.ok).toBe(true)
  expect(r.content).toContain('agent #42')
  expect(r.content).toContain('identity only')
})

test('a2a.reputation reports a missing agent', async () => {
  const client = {
    readContract: async () => [0n, '0x0000000000000000000000000000000000000000'] as const,
  } as unknown as PublicClient
  const [tool] = makeReputationTools(config(84532), { client })
  const r = await tool!.run({ agent: 'ghost' }, ctx())
  expect(r.ok).toBe(false)
  expect(r.content).toContain('no agent named')
})

test('a2a.reputation fails soft when the chain has no registry', async () => {
  const [tool] = makeReputationTools(config(999))
  const r = await tool!.run({ agent: 'scout' }, ctx())
  expect(r.ok).toBe(false)
  expect(r.content).toContain('no agent registry')
})
