import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MemoryStore, StubBrain, type ToolContext } from '@compass_agents/core'
import { chatTurn, createSession, makeMemoryTools } from './chat'

async function mem(): Promise<MemoryStore> {
  return new MemoryStore(await mkdtemp(join(tmpdir(), 'compass-chat-')))
}

test('createSession registers the memory tools', async () => {
  const s = createSession({ brain: new StubBrain([]), memory: await mem() })
  expect(s.tools.has('memory.save')).toBe(true)
  expect(s.tools.has('memory.read')).toBe(true)
})

test('chatTurn runs a tool then concludes, threading history', async () => {
  const memory = await mem()
  const brain = new StubBrain([
    {
      content: null,
      toolCalls: [{ id: 't1', name: 'memory.save', args: { key: 'fav', value: 'ETH' } }],
    },
    { content: 'got it — your favorite is ETH.', toolCalls: [] },
  ])
  const session = createSession({ brain, memory, approvalsMode: 'off' })
  const res = await chatTurn(session, [], 'remember my favorite token is ETH')
  expect(res.content).toBe('got it — your favorite is ETH.')
  expect(await memory.read('agent', 'fav')).toBe('ETH')
  expect(res.history.length).toBeGreaterThan(0)
})

test('memory.read returns a placeholder when nothing is saved', async () => {
  const memory = await mem()
  const read = makeMemoryTools()[1]!
  const r = await read.run({ key: 'nope' }, { memory } as ToolContext)
  expect(r.content).toContain('nothing saved')
})
