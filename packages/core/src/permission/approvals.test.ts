import { expect, test } from 'bun:test'
import { z } from 'zod'
import type { ToolCall, ToolDef } from '../tools/types'
import { ApprovalGate } from './approvals'

const safeTool: ToolDef = {
  name: 'read',
  description: '',
  schema: z.any(),
  run: () => ({ content: '', ok: true }),
}
const dangerTool: ToolDef = {
  name: 'shell.run',
  description: '',
  schema: z.any(),
  dangerous: true,
  run: () => ({ content: '', ok: true }),
}
const call = (name: string, args: unknown = {}): ToolCall => ({ id: '1', name, args })

test('off mode allows dangerous tools', async () => {
  const g = new ApprovalGate({ mode: 'off' })
  expect((await g.check(call('shell.run'), dangerTool)).allowed).toBe(true)
})

test('hard deny applies even in off mode', async () => {
  const g = new ApprovalGate({ mode: 'off' })
  const d = await g.check(call('shell.run', { cmd: 'rm -rf /' }), dangerTool)
  expect(d.allowed).toBe(false)
  expect(d.reason).toContain('hard deny')
})

test('strict denies dangerous, allows safe', async () => {
  const g = new ApprovalGate({ mode: 'strict' })
  expect((await g.check(call('shell.run'), dangerTool)).allowed).toBe(false)
  expect((await g.check(call('read'), safeTool)).allowed).toBe(true)
})

test('prompt mode asks the prompter', async () => {
  let asked = false
  const g = new ApprovalGate({
    mode: 'prompt',
    prompter: () => {
      asked = true
      return Promise.resolve(true)
    },
  })
  const d = await g.check(call('shell.run'), dangerTool)
  expect(asked).toBe(true)
  expect(d.allowed).toBe(true)
})

test('prompt mode denies when prompter refuses', async () => {
  const g = new ApprovalGate({ mode: 'prompt', prompter: () => Promise.resolve(false) })
  expect((await g.check(call('shell.run'), dangerTool)).allowed).toBe(false)
})

test('session allowance skips the prompter', async () => {
  let count = 0
  const g = new ApprovalGate({
    mode: 'prompt',
    prompter: () => {
      count++
      return Promise.resolve(true)
    },
  })
  g.allowForSession('shell.run')
  await g.check(call('shell.run'), dangerTool)
  expect(count).toBe(0)
})
