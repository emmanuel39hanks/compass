import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MemoryStore, StubBrain } from '@compass_agents/core'
import {
  erc20PeriodTransfer,
  getSmartAccountsEnvironment,
  rootDelegation,
} from '@compass_agents/delegation'
import {
  A2ACoordinator,
  type A2AEnvelope,
  InProcessBus,
  PeerRegistry,
} from '@compass_agents/plugin-a2a'
import { Compass } from './orchestrator'

const env = getSmartAccountsEnvironment(11155111)
const HUMAN = '0x1111111111111111111111111111111111111111' as const
const PRINCIPAL = '0x2222222222222222222222222222222222222222' as const
const WORKER = '0x3333333333333333333333333333333333333333' as const

test('Compass.chat runs an a2a tool call then concludes', async () => {
  const root = rootDelegation({
    environment: env,
    from: HUMAN,
    to: PRINCIPAL,
    scope: erc20PeriodTransfer({
      tokenAddress: '0x4444444444444444444444444444444444444444',
      periodAmount: 50_000_000n,
      periodDuration: 604_800,
      startDate: 1_700_000_000,
    }),
  })
  const bus = new InProcessBus()
  const registry = new PeerRegistry()
  registry.add({ name: 'worker', address: WORKER })
  const coordinator = new A2ACoordinator({
    selfName: 'principal',
    selfAddress: PRINCIPAL,
    environment: env,
    registry,
    transport: bus,
    parentAuthority: root,
  })
  const memory = new MemoryStore(await mkdtemp(join(tmpdir(), 'compass-cli-')))

  const seen: A2AEnvelope[] = []
  bus.subscribe('worker', e => {
    seen.push(e)
  })

  const brain = new StubBrain([
    {
      content: null,
      toolCalls: [{ id: 't1', name: 'a2a.request', args: { peer: 'worker', task: 'price check' } }],
    },
    { content: 'delegated and requested.', toolCalls: [] },
  ])

  const compass = new Compass({ brain, coordinator, registry, memory })
  const res = await compass.chat('coordinate a rebalance')
  expect(res.content).toBe('delegated and requested.')
  expect(seen.some(e => e.kind === 'request')).toBe(true)
})
