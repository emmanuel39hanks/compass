import { expect, test } from 'bun:test'
import type { BrainMessage } from '../brain/types'
import { compactHistory } from './compaction'

const summarize = async (msgs: BrainMessage[]) => `summarized ${msgs.length} messages`

function convo(n: number): BrainMessage[] {
  const out: BrainMessage[] = []
  for (let i = 0; i < n; i++) {
    out.push({ role: 'user', content: `q${i}` })
    out.push({ role: 'assistant', content: `a${i}` })
  }
  return out
}

test('below threshold, history is unchanged', async () => {
  const h = convo(5) // 10 messages
  expect(await compactHistory(h, { threshold: 40, keepRecent: 12, summarize })).toBe(h)
})

test('above threshold, older turns fold into one summary + recent verbatim', async () => {
  const h = convo(30) // 60 messages
  const out = await compactHistory(h, { threshold: 40, keepRecent: 12, summarize })
  expect(out[0]?.role).toBe('system')
  expect(out[0]?.content).toContain('Summary of earlier conversation')
  expect(out.length).toBeLessThan(h.length)
  // the most recent message is preserved verbatim
  expect(out[out.length - 1]?.content).toBe('a29')
})

test('the recent window snaps to a user boundary (no orphan tool message)', async () => {
  const h: BrainMessage[] = [
    ...convo(25),
    { role: 'user', content: 'do x' },
    { role: 'assistant', content: '', toolCalls: [{ id: '1', name: 't', args: {} }] },
    { role: 'tool', content: 'result', toolCallId: '1' },
    { role: 'assistant', content: 'done' },
  ]
  const out = await compactHistory(h, { threshold: 40, keepRecent: 3, summarize })
  // first non-summary message must be a user message, never an orphan tool/assistant-call
  expect(out[1]?.role).toBe('user')
})
