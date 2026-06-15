import { expect, test } from 'bun:test'
import { encodeFunctionData } from 'viem'
import { AGENT_REGISTRY_ABI, COMPASS_AGENT_REGISTRY, buildAgentCard } from './identity'

test('registry is deployed on Base Sepolia', () => {
  expect(COMPASS_AGENT_REGISTRY[84_532]).toBe('0x5eDc156Ef946261D9c66ECC17218952D77BFE650')
})

test('buildAgentCard produces a v0.3.0 AgentCard', () => {
  const card = buildAgentCard({ name: 'scout' })
  expect(card.protocolVersion).toBe('0.3.0')
  expect(card.name).toBe('scout')
  expect(card.skills.length).toBeGreaterThan(0)
  expect(card.skills.map(s => s.id)).toContain('spend')
})

test('register call encodes against the ABI', () => {
  const data = encodeFunctionData({
    abi: AGENT_REGISTRY_ABI,
    functionName: 'register',
    args: [
      '0x1111111111111111111111111111111111111111',
      'scout',
      'https://compass.app/a/scout',
      '0x1111111111111111111111111111111111111111',
      '0x',
    ],
  })
  expect(data.startsWith('0x')).toBe(true)
  expect(data.length).toBeGreaterThan(10)
})
