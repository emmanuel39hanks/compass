import { expect, test } from 'bun:test'
import { StubBrain } from '@compass_agents/core'
import { getSmartAccountsEnvironment } from '@compass_agents/delegation'
import { X402Facilitator } from '@compass_agents/x402'
import type { Hex } from 'viem'
import { DEMO_ADDRESSES, type DemoRelayer, runDemoSpine } from './demo'

const chainId = 11155111
const environment = getSmartAccountsEnvironment(chainId)
const TASK = `0x${'a'.repeat(64)}` as Hex
const TX = `0x${'b'.repeat(64)}` as Hex

function brain() {
  return new StubBrain([{ content: 'Plan: research price, then swap.', toolCalls: [] }])
}
const relayer: DemoRelayer = { send7710: () => Promise.resolve(TASK) }

test('demo spine runs all six beats end to end (offline)', async () => {
  const facilitator = new X402Facilitator({
    simulate: () => Promise.resolve(true),
    settle: () => Promise.resolve(TX),
  })
  const res = await runDemoSpine({ brain: brain(), relayer, facilitator, environment, chainId })
  expect(res.beats.map(b => b.step)).toEqual([1, 2, 3, 4, 5, 6])
  expect(res.taskId).toBe(TASK)
  expect(res.grant.delegate.toLowerCase()).toBe(DEMO_ADDRESSES.worker.toLowerCase())
  expect(res.redeemData.startsWith('0x')).toBe(true)
})

test('demo halts when x402 settlement is rejected (out of caveats)', async () => {
  const facilitator = new X402Facilitator({
    simulate: () => Promise.resolve(false),
    settle: () => Promise.resolve(TX),
  })
  await expect(
    runDemoSpine({ brain: brain(), relayer, facilitator, environment, chainId }),
  ).rejects.toThrow(/cannot settle/)
})
