import { expect, test } from 'bun:test'
import { defineConfig, parseConfig } from './config'

const valid = {
  identity: { signerSource: 'privkey' as const },
  network: { chainId: 8453, rpcUrl: 'https://mainnet.base.org' },
  brain: {},
}

test('valid config parses and applies defaults', () => {
  const c = parseConfig(valid)
  expect(c.brain.model).toBe('qwen3-next-80b')
  expect(c.brain.baseUrl).toBe('https://api.venice.ai/api/v1')
  expect(c.approvals.mode).toBe('prompt')
  expect(c.network.chainId).toBe(8453)
})

test('invalid config is rejected', () => {
  expect(() => parseConfig({ network: { chainId: -1, rpcUrl: 'nope' } })).toThrow()
})

test('defineConfig is a typed pass-through', () => {
  expect(defineConfig(valid)).toBe(valid)
})
