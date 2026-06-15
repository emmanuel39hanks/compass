import { expect, test } from 'bun:test'
import {
  delegationHash,
  erc20PeriodTransfer,
  getSmartAccountsEnvironment,
  rootDelegation,
} from '@compass_agents/delegation'
import { InProcessBus } from './bus'
import { A2ACoordinator } from './coordinator'
import type { A2AEnvelope } from './envelope'
import { PeerRegistry } from './peers'

const env = getSmartAccountsEnvironment(11155111)
const HUMAN = '0x1111111111111111111111111111111111111111' as const
const PRINCIPAL = '0x2222222222222222222222222222222222222222' as const
const WORKER = '0x3333333333333333333333333333333333333333' as const
const USDC = '0x4444444444444444444444444444444444444444' as const

const root = rootDelegation({
  environment: env,
  from: HUMAN,
  to: PRINCIPAL,
  scope: erc20PeriodTransfer({
    tokenAddress: USDC,
    periodAmount: 50_000_000n,
    periodDuration: 604_800,
    startDate: 1_700_000_000,
  }),
})

function setup() {
  const bus = new InProcessBus()
  const principalReg = new PeerRegistry()
  principalReg.add({ name: 'worker', address: WORKER })
  const workerReg = new PeerRegistry()
  workerReg.add({ name: 'principal', address: PRINCIPAL })
  const principal = new A2ACoordinator({
    selfName: 'principal',
    selfAddress: PRINCIPAL,
    environment: env,
    registry: principalReg,
    transport: bus,
    parentAuthority: root,
  })
  const worker = new A2ACoordinator({
    selfName: 'worker',
    selfAddress: WORKER,
    environment: env,
    registry: workerReg,
    transport: bus,
  })
  return { bus, principal, worker }
}

test('grant redelegates a narrowed slice with authority = hash(parent)', async () => {
  const { principal } = setup()
  const child = await principal.grant('worker')
  expect(child.delegate.toLowerCase()).toBe(WORKER)
  expect(child.delegator.toLowerCase()).toBe(PRINCIPAL)
  expect(child.authority.toLowerCase()).toBe(delegationHash(root).toLowerCase())
})

test('request -> grant handshake delivers a delegation to the worker', async () => {
  const { principal, worker } = setup()
  const granted: A2AEnvelope[] = []
  worker.on(e => {
    if (e.kind === 'grant') granted.push(e)
  })
  principal.onRequest(() => ({})) // grant unconditionally for the demo
  await worker.request('principal', 'swap 10 USDC -> ETH')
  expect(granted).toHaveLength(1)
  const d = granted[0]?.delegation
  expect(d?.delegate.toLowerCase()).toBe(WORKER)
  expect(d?.authority.toLowerCase()).toBe(delegationHash(root).toLowerCase())
})

test('grant without held authority throws', async () => {
  const { worker } = setup()
  await expect(worker.grant('principal')).rejects.toThrow(/no authority/)
})

test('revoke emits a revoke envelope to the peer', async () => {
  const { principal, worker } = setup()
  const seen: A2AEnvelope[] = []
  worker.on(e => {
    seen.push(e)
  })
  const child = await principal.grant('worker')
  await principal.revoke('worker', child)
  expect(seen.some(e => e.kind === 'revoke')).toBe(true)
})
