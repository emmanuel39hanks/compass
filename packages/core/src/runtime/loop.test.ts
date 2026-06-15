import { expect, test } from 'bun:test'
import { z } from 'zod'
import { StubBrain } from '../brain/stub'
import { ApprovalGate } from '../permission/approvals'
import { ToolRegistry } from '../tools/registry'
import type { ToolContext, ToolDef } from '../tools/types'
import { runTurn } from './loop'

function setup() {
  const tools = new ToolRegistry()
  const add: ToolDef<{ a: number; b: number }> = {
    name: 'add',
    description: 'add two numbers',
    schema: z.object({ a: z.number(), b: z.number() }),
    run: args => ({ content: String(args.a + args.b), ok: true }),
  }
  tools.register(add)
  const gate = new ApprovalGate({ mode: 'off' })
  const ctx: ToolContext = { memory: undefined as never }
  return { tools, gate, ctx }
}

test('loop returns content when there are no tool calls', async () => {
  const brain = new StubBrain([{ content: 'hello', toolCalls: [] }])
  const { tools, gate, ctx } = setup()
  const res = await runTurn(
    { kind: 'chat', text: 'hi' },
    { brain, tools, gate, ctx, system: 'sys' },
  )
  expect(res.content).toBe('hello')
  expect(res.iterations).toBe(1)
})

test('loop executes a tool call then returns the final answer', async () => {
  const brain = new StubBrain([
    { content: null, toolCalls: [{ id: 't1', name: 'add', args: { a: 2, b: 3 } }] },
    { content: 'the answer is 5', toolCalls: [] },
  ])
  const { tools, gate, ctx } = setup()
  const res = await runTurn(
    { kind: 'chat', text: 'add 2 and 3' },
    { brain, tools, gate, ctx, system: 'sys' },
  )
  expect(res.content).toBe('the answer is 5')
  expect(res.iterations).toBe(2)
  expect(res.history.find(m => m.role === 'tool')?.content).toBe('5')
})

test('loop stops at max iterations when the brain never concludes', async () => {
  const looping = () => ({
    content: null,
    toolCalls: [{ id: 'x', name: 'add', args: { a: 1, b: 1 } }],
  })
  const brain = new StubBrain(Array.from({ length: 20 }, looping))
  const { tools, gate, ctx } = setup()
  const res = await runTurn(
    { kind: 'chat', text: 'go' },
    { brain, tools, gate, ctx, system: 'sys' },
  )
  expect(res.iterations).toBe(12)
  expect(res.content).toContain('stopped after')
})
