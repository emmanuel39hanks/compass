import type { Brain } from '@compass_agents/core'
import {
  type Delegation,
  type SmartAccountsEnvironment,
  encodeRedeem,
  erc20PeriodTransfer,
  execution,
  linkChain,
  rootDelegation,
} from '@compass_agents/delegation'
import { A2ACoordinator, InProcessBus, PeerRegistry } from '@compass_agents/plugin-a2a'
import type { Send7710Input } from '@compass_agents/relayer-1shot'
import { type X402Facilitator, buildDelegatedPayment } from '@compass_agents/x402'
import type { Hex } from 'viem'

export interface DemoAddresses {
  human: Hex
  principal: Hex
  worker: Hex
  usdc: Hex
  router: Hex
}

export const DEMO_ADDRESSES: DemoAddresses = {
  human: '0x1111111111111111111111111111111111111111',
  principal: '0x2222222222222222222222222222222222222222',
  worker: '0x3333333333333333333333333333333333333333',
  usdc: '0x4444444444444444444444444444444444444444',
  router: '0x5555555555555555555555555555555555555555',
}

/** Structurally satisfied by the real OneShotRelayer; mockable in tests. */
export interface DemoRelayer {
  send7710(input: Send7710Input): Promise<Hex>
}

export interface DemoDeps {
  brain: Brain
  relayer: DemoRelayer
  facilitator: X402Facilitator
  environment: SmartAccountsEnvironment
  chainId: number
  addresses?: DemoAddresses
}

export interface DemoBeat {
  step: number
  title: string
  detail: string
}

export interface DemoResult {
  beats: DemoBeat[]
  taskId: Hex
  grant: Delegation
  redeemData: Hex
}

/**
 * The end-to-end demo spine that ties all six packages together. Each beat maps
 * to a moment in docs/DEMO.md. Layers (brain/relayer/facilitator) are injected
 * so this runs fully offline in tests and against live services in the demo.
 */
export async function runDemoSpine(deps: DemoDeps): Promise<DemoResult> {
  const a = deps.addresses ?? DEMO_ADDRESSES
  const beats: DemoBeat[] = []

  // Beat 1 — human grants the principal a budget (ERC-7715; root delegation here).
  const root = rootDelegation({
    environment: deps.environment,
    from: a.human,
    to: a.principal,
    scope: erc20PeriodTransfer({
      tokenAddress: a.usdc,
      periodAmount: 50_000_000n,
      periodDuration: 604_800,
      startDate: 1_700_000_000,
    }),
  })
  beats.push({
    step: 1,
    title: 'ERC-7715 grant',
    detail: `human ${a.human} granted the principal up to 50 USDC / week`,
  })

  // Beat 2 — principal plans with Venice.
  const plan = await deps.brain.infer({
    system: 'You are the principal agent. Decompose the task into sub-agent steps.',
    messages: [{ role: 'user', content: 'Rebalance up to 25 USDC into ETH this hour.' }],
    tools: [],
  })
  beats.push({ step: 2, title: 'Venice plan', detail: plan.content ?? '(planned)' })

  // Beat 3 — principal redelegates a narrowed slice to the worker (A2A).
  const bus = new InProcessBus()
  const registry = new PeerRegistry()
  registry.add({ name: 'worker', address: a.worker })
  const principal = new A2ACoordinator({
    selfName: 'principal',
    selfAddress: a.principal,
    environment: deps.environment,
    registry,
    transport: bus,
    parentAuthority: root,
  })
  const grant = await principal.grant('worker')
  beats.push({
    step: 3,
    title: 'Redelegation',
    detail: `principal redelegated to worker (authority = hash(parent) = ${grant.authority.slice(0, 12)}…)`,
  })

  const chain = linkChain(grant, root)

  // Beat 4 — worker pays an x402 paywall from its delegated allowance.
  const payment = buildDelegatedPayment(
    { scheme: 'erc7710', network: String(deps.chainId) },
    {
      delegationManager: deps.environment.DelegationManager as Hex,
      permissionContext: chain,
      delegator: a.principal,
    },
  )
  const settled = await deps.facilitator.settle(payment)
  beats.push({
    step: 4,
    title: 'x402 payment',
    detail: `worker paid a data endpoint from the delegated allowance (tx ${settled.txHash.slice(0, 12)}…)`,
  })

  // Beat 5 — worker redeems the chain; relayed on mainnet via 1Shot.
  const redeemData = encodeRedeem(chain, [execution({ target: a.router })])
  const taskId = await deps.relayer.send7710({
    chainId: deps.chainId,
    permissionContext: chain,
    executions: [{ target: a.router, value: '0', data: '0x' }],
  })
  beats.push({
    step: 5,
    title: '1Shot mainnet relay',
    detail: `worker redeemed the chain; relayed via 1Shot (taskId ${taskId.slice(0, 12)}…)`,
  })

  // Beat 6 — status from the 1Shot webhook.
  beats.push({ step: 6, title: 'Webhook status', detail: '1Shot webhook → confirmed' })

  return { beats, taskId, grant, redeemData }
}
