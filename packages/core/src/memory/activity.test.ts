import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ActivityLog } from './activity'

async function logPath() {
  return join(await mkdtemp(join(tmpdir(), 'compass-act-')), 'activity.jsonl')
}

test('appends entries and tails them oldest→newest', async () => {
  const log = new ActivityLog(await logPath(), () => '2026-06-15T00:00:00Z')
  await log.append({ kind: 'tool', summary: 'chain.balance' })
  await log.append({ kind: 'action', summary: 'sent 0.1 USDC', meta: { tx: '0xabc' } })
  const entries = await log.tail()
  expect(entries.map(e => e.summary)).toEqual(['chain.balance', 'sent 0.1 USDC'])
  expect(entries[1]?.meta).toEqual({ tx: '0xabc' })
  expect(entries[0]?.ts).toBe('2026-06-15T00:00:00Z')
})

test('tail(n) returns only the last n', async () => {
  const log = new ActivityLog(await logPath())
  for (let i = 0; i < 10; i++) await log.append({ kind: 'note', summary: `n${i}` })
  const last3 = await log.tail(3)
  expect(last3.map(e => e.summary)).toEqual(['n7', 'n8', 'n9'])
})

test('tail on a missing log returns []', async () => {
  const log = new ActivityLog(join(tmpdir(), 'compass-nope', 'missing.jsonl'))
  expect(await log.tail()).toEqual([])
})
