import { expect, test } from 'bun:test'
import type { Address, PublicClient } from 'viem'
import { normalizeReputation, readReputation, readValidationSummary } from './reputation'

const AGENT = 7n

test('normalizeReputation scales value by decimals', () => {
  expect(normalizeReputation(12n, 950n, 1)).toEqual({
    count: 12,
    score: 95,
    raw: { value: 950n, decimals: 1 },
  })
  expect(normalizeReputation(0n, 0n, 0)).toEqual({
    count: 0,
    score: 0,
    raw: { value: 0n, decimals: 0 },
  })
})

test('readReputation reads + normalizes the registry getSummary tuple', async () => {
  const client = {
    readContract: async (req: { functionName: string; args: unknown[] }) => {
      expect(req.functionName).toBe('getSummary')
      expect(req.args[0]).toBe(AGENT)
      return [5n, 880n, 1] as const // count, summaryValue, decimals
    },
  } as unknown as PublicClient
  const r = await readReputation({
    client,
    registry: '0x1111111111111111111111111111111111111111' as Address,
    agentId: AGENT,
  })
  expect(r.count).toBe(5)
  expect(r.score).toBe(88)
})

test('readValidationSummary returns count + average response', async () => {
  const client = {
    readContract: async () => [3n, 92] as const,
  } as unknown as PublicClient
  const v = await readValidationSummary({
    client,
    registry: '0x2222222222222222222222222222222222222222' as Address,
    agentId: AGENT,
  })
  expect(v).toEqual({ count: 3, averageResponse: 92 })
})
