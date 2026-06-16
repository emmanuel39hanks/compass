import { expect, test } from 'bun:test'
import { z } from 'zod'
import { ApprovalGate } from '../permission/approvals'
import { ToolRegistry, sanitizeJsonSchema } from './registry'
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

test('schemas never advertise a boolean exclusiveMinimum (Venice rejects it)', () => {
  // `.positive()` compiles to {minimum:0, exclusiveMinimum:true} under openApi3 —
  // which made Venice 400 the entire tool list. The registry must sanitize it.
  const r = new ToolRegistry()
  r.register({
    name: 'paged',
    description: 'has a positive number',
    schema: z.object({ limit: z.number().positive() }),
    run: () => ({ content: '', ok: true }),
  } as ToolDef)
  const json = JSON.stringify(r.schemas()[0]?.parameters)
  expect(json).not.toContain('"exclusiveMinimum":true')
  expect(json).toContain('"exclusiveMinimum":0') // converted to the numeric form
})

test('sanitizeJsonSchema converts OpenAPI-3 boolean exclusive bounds to numbers', () => {
  const out = sanitizeJsonSchema({
    type: 'object',
    properties: {
      a: { type: 'number', minimum: 0, exclusiveMinimum: true },
      b: { type: 'number', maximum: 50, exclusiveMaximum: true },
      c: { type: 'number', minimum: 1, exclusiveMinimum: false },
    },
  }) as { properties: Record<string, Record<string, unknown>> }
  expect(out.properties.a).toEqual({ type: 'number', exclusiveMinimum: 0 })
  expect(out.properties.b).toEqual({ type: 'number', exclusiveMaximum: 50 })
  expect(out.properties.c).toEqual({ type: 'number', minimum: 1 })
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
