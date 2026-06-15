import { expect, test } from 'bun:test'
import { parseConfig } from '@compass_agents/core'
import { buildInitConfig, upsertEnv } from './init'

test('upsertEnv appends new keys', () => {
  expect(upsertEnv('', { VENICE_API_KEY: 'abc' })).toBe('VENICE_API_KEY=abc\n')
  expect(upsertEnv('FOO=1\n', { BAR: '2' })).toBe('FOO=1\nBAR=2\n')
  expect(upsertEnv('FOO=1', { BAR: '2' })).toBe('FOO=1\nBAR=2\n')
})

test('upsertEnv replaces an existing key in place (no duplicate)', () => {
  const out = upsertEnv('VENICE_API_KEY=old\nCOMPASS_PRIVATE_KEY=0xkey\n', {
    VENICE_API_KEY: 'new',
  })
  expect(out).toBe('VENICE_API_KEY=new\nCOMPASS_PRIVATE_KEY=0xkey\n')
  expect(out.match(/VENICE_API_KEY=/g)).toHaveLength(1)
})

test('buildInitConfig produces a valid config (base-sepolia default)', () => {
  const parsed = parseConfig(buildInitConfig({ budget: '25 USDC/week', agentName: 'scout' }))
  expect(parsed.network.chainId).toBe(84_532)
  expect(parsed.network.name).toBe('Base Sepolia')
  expect(parsed.budget?.amount).toBe('25')
  expect(parsed.identity.agentName).toBe('scout')
  expect(parsed.relayer?.endpoint).toContain('1shotapi.dev')
})

test('base mainnet uses the mainnet relayer', () => {
  const parsed = parseConfig(buildInitConfig({ network: 'base' }))
  expect(parsed.network.chainId).toBe(8_453)
  expect(parsed.relayer?.endpoint).toContain('relayer.1shotapi.com')
})

test('an unknown network falls back to base-sepolia', () => {
  const parsed = parseConfig(buildInitConfig({ network: 'mars' as never }))
  expect(parsed.network.chainId).toBe(84_532)
})

test('an invalid budget is rejected', () => {
  expect(() => buildInitConfig({ budget: 'lots' })).toThrow()
})
