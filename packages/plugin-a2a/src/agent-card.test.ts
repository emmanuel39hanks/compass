import { expect, test } from 'bun:test'
import { type AgentCard, buildAgentCard } from './agent-card'

test('buildAgentCard derives skills from recognized tool names', () => {
  const card = buildAgentCard({
    name: 'scout',
    url: 'https://scout.example/a2a',
    toolNames: ['chain.send', 'pay', 'discover', 'unknown.tool', 'venice.image'],
  })
  expect(card.protocolVersion).toBe('0.3.0')
  expect(card.name).toBe('scout')
  expect(card.url).toBe('https://scout.example/a2a')
  const ids = card.skills.map(s => s.id)
  expect(ids).toContain('chain.send')
  expect(ids).toContain('pay')
  expect(ids).toContain('discover')
  expect(ids).toContain('venice.image')
  expect(ids).not.toContain('unknown.tool') // unrecognized tools aren't advertised
})

test('buildAgentCard dedupes and appends extra skills', () => {
  const card = buildAgentCard({
    name: 'scout',
    url: 'https://x/a2a',
    toolNames: ['pay', 'pay'],
    extraSkills: [{ id: 'custom', name: 'Custom', description: 'does a thing', tags: ['x'] }],
  })
  expect(card.skills.filter(s => s.id === 'pay')).toHaveLength(1)
  expect(card.skills.find(s => s.id === 'custom')?.name).toBe('Custom')
})

test('buildAgentCard is a valid, serializable A2A card', () => {
  const card = buildAgentCard({ name: 'a', url: 'https://a/a2a', organization: 'compass' })
  const round = JSON.parse(JSON.stringify(card)) as AgentCard
  expect(round.capabilities.streaming).toBe(false)
  expect(round.defaultOutputModes).toEqual(['text/plain'])
  expect(round.provider?.organization).toBe('compass')
})
