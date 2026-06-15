import { expect, test } from 'bun:test'
import type { ToolContext } from '@compass_agents/core'
import {
  erc20PeriodTransfer,
  getSmartAccountsEnvironment,
  rootDelegation,
} from '@compass_agents/delegation'
import { InProcessBus } from './bus'
import { A2ACoordinator } from './coordinator'
import { PeerRegistry } from './peers'
import { makeA2ATools } from './tools'

const env = getSmartAccountsEnvironment(11155111)
const HUMAN = '0x1111111111111111111111111111111111111111' as const
const PRINCIPAL = '0x2222222222222222222222222222222222222222' as const
const WORKER = '0x3333333333333333333333333333333333333333' as const

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

function setup() {
  const registry = new PeerRegistry()
  registry.add({ name: 'worker', address: WORKER })
  const coordinator = new A2ACoordinator({
    selfName: 'principal',
    selfAddress: PRINCIPAL,
    environment: env,
    registry,
    transport: new InProcessBus(),
    parentAuthority: root,
  })
  return { tools: makeA2ATools(coordinator, registry), registry }
}

const ctx = (): ToolContext => ({ memory: undefined as never })

test('exposes the a2a tool surface', () => {
  const { tools } = setup()
  expect(tools.map(t => t.name).sort()).toEqual([
    'a2a.grant',
    'a2a.peer_add',
    'a2a.peers',
    'a2a.request',
  ])
})

test('a2a.peers lists the directory', async () => {
  const { tools } = setup()
  const peers = tools.find(t => t.name === 'a2a.peers')
  const r = await peers?.run({}, ctx())
  expect(r?.content).toContain('worker')
})

test('a2a.grant redelegates to a peer', async () => {
  const { tools } = setup()
  const grant = tools.find(t => t.name === 'a2a.grant')
  const r = await grant?.run({ peer: 'worker' }, ctx())
  expect(r?.ok).toBe(true)
  expect(r?.content).toContain('granted authority to worker')
})

test('a2a.peer_add rejects a malformed address at the schema', () => {
  const { tools } = setup()
  const add = tools.find(t => t.name === 'a2a.peer_add')
  expect(add?.schema.safeParse({ name: 'x', address: 'not-an-address' }).success).toBe(false)
  expect(
    add?.schema.safeParse({ name: 'x', address: '0x5555555555555555555555555555555555555555' })
      .success,
  ).toBe(true)
})
