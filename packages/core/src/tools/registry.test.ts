import { expect, test } from 'bun:test'
import { z } from 'zod'
import { ApprovalGate } from '../permission/approvals'
import { ToolRegistry } from './registry'
import type { ToolContext, ToolDef } from './types'

const echo: ToolDef<{ msg: string }> = {
  name: 'echo',
  description: 'echo a message',
  schema: z.object({ msg: z.string() }),
  run: args => ({ content: args.msg, ok: true }),
}

const ctx = (): ToolContext => ({ memory: undefined as never })
const gateOff = new ApprovalGate({ mode: 'off' })

test('register and retrieve', () => {
  const r = new ToolRegistry()
  r.register(echo)
  expect(r.has('echo')).toBe(true)
  expect(r.list()).toHaveLength(1)
})

test('duplicate registration throws', () => {
  const r = new ToolRegistry()
  r.register(echo)
  expect(() => r.register(echo)).toThrow()
})

test('schemas produce json-schema parameters', () => {
  const r = new ToolRegistry()
  r.register(echo)
  const [s] = r.schemas()
  expect(s?.name).toBe('echo')
  expect(JSON.stringify(s?.parameters)).toContain('msg')
})

test('dispatch: unknown tool', async () => {
  const r = new ToolRegistry()
  const msg = await r.dispatch({ id: '1', name: 'nope', args: {} }, ctx(), gateOff)
  expect(msg.content).toContain('unknown tool')
})

test('dispatch: invalid args', async () => {
  const r = new ToolRegistry()
  r.register(echo)
  const msg = await r.dispatch({ id: '1', name: 'echo', args: { msg: 123 } }, ctx(), gateOff)
  expect(msg.content).toContain('invalid args')
})

test('dispatch: success returns a tool message', async () => {
  const r = new ToolRegistry()
  r.register(echo)
  const msg = await r.dispatch({ id: '1', name: 'echo', args: { msg: 'hi' } }, ctx(), gateOff)
  expect(msg.role).toBe('tool')
  expect(msg.toolCallId).toBe('1')
  expect(msg.content).toBe('hi')
})

test('dispatch: respects the approval gate', async () => {
  const r = new ToolRegistry()
  r.register({ ...echo, dangerous: true })
  const strict = new ApprovalGate({ mode: 'strict' })
  const msg = await r.dispatch({ id: '1', name: 'echo', args: { msg: 'hi' } }, ctx(), strict)
  expect(msg.content).toContain('denied')
})
