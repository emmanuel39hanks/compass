import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ActivityLog,
  type BrainTurn,
  MemoryStore,
  StubBrain,
  type ToolContext,
  type ToolDef,
  ToolRegistry,
} from '@compass_agents/core'
import { z } from 'zod'
import { Gateway } from './gateway'
import { PairingStore } from './pairing'

async function mem() {
  return new MemoryStore(await mkdtemp(join(tmpdir(), 'compass-gw-')))
}

/** A dangerous tool that records whether it ran. */
function dangerTool(ran: { count: number }): ToolDef<Record<string, never>> {
  return {
    name: 'danger',
    description: 'a dangerous action',
    dangerous: true,
    schema: z.object({}),
    run: (_args, _ctx: ToolContext) => {
      ran.count++
      return { content: 'did the thing', ok: true }
    },
  }
}

const callDanger: BrainTurn = {
  content: null,
  toolCalls: [{ id: '1', name: 'danger', args: {} }],
}
const sayDone: BrainTurn = { content: 'done', toolCalls: [] }

async function setup(script: BrainTurn[], opts: { pairing?: PairingStore } = {}) {
  const ran = { count: 0 }
  const tools = new ToolRegistry()
  tools.register(dangerTool(ran))
  const gw = new Gateway({
    brain: new StubBrain(script),
    tools,
    memory: await mem(),
    system: 'sys',
    ...(opts.pairing ? { pairing: opts.pairing } : {}),
  })
  return { gw, ran }
}

test('a dangerous tool runs when the surface approves "once"', async () => {
  const { gw, ran } = await setup([callDanger, sayDone])
  let asked = 0
  const reply = await gw.handleMessage(
    { surface: 'telegram', chatId: '1', text: 'do it' },
    {
      approve: async () => {
        asked++
        return 'once'
      },
    },
  )
  expect(reply).toBe('done')
  expect(ran.count).toBe(1)
  expect(asked).toBe(1)
})

test('a dangerous tool is blocked when the surface denies', async () => {
  const { gw, ran } = await setup([callDanger, sayDone])
  await gw.handleMessage(
    { surface: 'telegram', chatId: '1', text: 'do it' },
    { approve: async () => 'deny' },
  )
  expect(ran.count).toBe(0)
})

test('"session" approval is remembered — no re-prompt next turn in the same chat', async () => {
  const { gw, ran } = await setup([callDanger, sayDone, callDanger, sayDone])
  let asked = 0
  const approve = async () => {
    asked++
    return 'session' as const
  }
  await gw.handleMessage({ surface: 'telegram', chatId: '1', text: 'once' }, { approve })
  await gw.handleMessage({ surface: 'telegram', chatId: '1', text: 'again' }, { approve })
  expect(asked).toBe(1) // asked only the first time
  expect(ran.count).toBe(2) // but ran both times
})

test('with no approve hook, dangerous tools are denied', async () => {
  const { gw, ran } = await setup([callDanger, sayDone])
  await gw.handleMessage({ surface: 'telegram', chatId: '1', text: 'do it' }, {})
  expect(ran.count).toBe(0)
})

test('per-chat history is threaded and isolated', async () => {
  const brain = new StubBrain([sayDone, sayDone, sayDone])
  const tools = new ToolRegistry()
  const gw = new Gateway({ brain, tools, memory: await mem(), system: 'sys' })
  await gw.handleMessage({ surface: 'telegram', chatId: 'A', text: 'first' })
  await gw.handleMessage({ surface: 'telegram', chatId: 'A', text: 'second' })
  await gw.handleMessage({ surface: 'telegram', chatId: 'B', text: 'other' })
  // chat A's 2nd turn saw the 1st message; chat B's turn did not see chat A.
  const secondCallA = brain.calls[1]?.messages.map(m => m.content) ?? []
  const callB = brain.calls[2]?.messages.map(m => m.content) ?? []
  expect(secondCallA).toContain('first')
  expect(callB).not.toContain('first')
})

test('persistHistory: a fresh gateway recalls last session’s history', async () => {
  const memory = await mem()
  const sayDone: BrainTurn = { content: 'ok', toolCalls: [] }
  const gw1 = new Gateway({
    brain: new StubBrain([sayDone]),
    tools: new ToolRegistry(),
    memory,
    system: 'sys',
    persistHistory: true,
  })
  await gw1.handleMessage({ surface: 'telegram', chatId: '1', text: 'remember oranges' })

  // a new process / Gateway pointed at the same memory dir
  const brain2 = new StubBrain([sayDone])
  const gw2 = new Gateway({
    brain: brain2,
    tools: new ToolRegistry(),
    memory,
    system: 'sys',
    persistHistory: true,
  })
  await gw2.handleMessage({ surface: 'telegram', chatId: '1', text: 'what did I say?' })
  const seen = brain2.calls[0]?.messages.map(m => m.content) ?? []
  expect(seen).toContain('remember oranges') // loaded from disk
})

test('activity log records the message + each tool call', async () => {
  const ran = { count: 0 }
  const tools = new ToolRegistry()
  tools.register(dangerTool(ran))
  const activity = new ActivityLog(join(await mkdtemp(join(tmpdir(), 'compass-act-')), 'a.jsonl'))
  const gw = new Gateway({
    brain: new StubBrain([callDanger, sayDone]),
    tools,
    memory: await mem(),
    system: 'sys',
    activity,
  })
  await gw.handleMessage(
    { surface: 'telegram', chatId: '1', text: 'do it' },
    { approve: async () => 'once' },
  )
  const entries = await activity.tail()
  expect(entries.some(e => e.kind === 'message')).toBe(true)
  expect(entries.some(e => e.kind === 'tool' && e.summary === 'danger')).toBe(true)
})

test('compaction folds old turns once history passes the threshold', async () => {
  const sayDone: BrainTurn = { content: 'ok', toolCalls: [] }
  const summary: BrainTurn = { content: 'SUMMARY OF EARLIER', toolCalls: [] }
  const brain = new StubBrain([sayDone, sayDone, summary, sayDone])
  const gw2 = new Gateway({
    brain,
    tools: new ToolRegistry(),
    memory: await mem(),
    system: 'sys',
    compaction: { threshold: 2, keepRecent: 2 },
  })
  await gw2.handleMessage({ surface: 'telegram', chatId: '1', text: 'a' })
  await gw2.handleMessage({ surface: 'telegram', chatId: '1', text: 'b' }) // crosses threshold → compacts
  await gw2.handleMessage({ surface: 'telegram', chatId: '1', text: 'c' }) // sees the folded summary
  const lastCall = brain.calls.at(-1)?.messages ?? []
  expect(lastCall.some(m => m.role === 'system' && m.content.includes('SUMMARY OF EARLIER'))).toBe(
    true,
  )
})

test('unpaired senders get a pairing prompt, not a brain turn', async () => {
  const pairing = new PairingStore({ genCode: () => 'ABC123' })
  const { gw, ran } = await setup([callDanger, sayDone], { pairing })
  const reply = await gw.handleMessage(
    { surface: 'telegram', chatId: '999', text: 'hello' },
    { approve: async () => 'once' },
  )
  expect(reply).toContain('ABC123')
  expect(reply).toContain('compass pairing approve telegram ABC123')
  expect(ran.count).toBe(0) // brain never ran

  // after approval, the next message reaches the brain
  pairing.approve('telegram', 'ABC123')
  const reply2 = await gw.handleMessage(
    { surface: 'telegram', chatId: '999', text: 'hello' },
    { approve: async () => 'once' },
  )
  expect(reply2).toBe('done')
})
