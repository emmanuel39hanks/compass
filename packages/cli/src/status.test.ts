import { expect, test } from 'bun:test'
import { parseConfig } from '@compass_agents/core'
import { buildInitConfig } from './init'
import { renderStatus } from './status'

test('renderStatus shows agent, network, budget, account', () => {
  const cfg = parseConfig(buildInitConfig({ agentName: 'scout', budget: '25 USDC/week' }))
  const out = renderStatus(cfg, { smartAccount: '0xabc0000000000000000000000000000000000000' })
  expect(out).toContain('scout')
  expect(out).toContain('Base Sepolia')
  expect(out).toContain('25 USDC / week')
  expect(out).toContain('0xabc0000000000000000000000000000000000000')
})

test('renderStatus handles a bare config', () => {
  const cfg = parseConfig(buildInitConfig({}))
  const out = renderStatus(cfg)
  expect(out).toContain('(unnamed)')
  expect(out).toContain('(none)')
  expect(out).toContain('(not created)')
})
