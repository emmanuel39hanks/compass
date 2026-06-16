import { expect, test } from 'bun:test'
import { ApprovalGate, type ToolContext, type ToolDef, ToolRegistry } from '@compass_agents/core'
import { z } from 'zod'
import { mcpCall, mcpToolList } from './mcp-server'

function registry(): ToolRegistry {
  const tools = new ToolRegistry()
  const echo: ToolDef<{ text: string }> = {
    name: 'echo',
    description: 'echo back',
    schema: z.object({ text: z.string() }),
    run: args => ({ content: `you said: ${args.text}`, ok: true }),
  }
  tools.register(echo)
  return tools
}

const ctx = (): ToolContext => ({ memory: undefined as never })
const gate = () => new ApprovalGate({ mode: 'off' })

test('mcpToolList advertises tools with their JSON Schema', () => {
  const list = mcpToolList(registry())
  expect(list).toHaveLength(1)
  expect(list[0]?.name).toBe('echo')
  expect(list[0]?.inputSchema).toBeDefined()
  expect((list[0]?.inputSchema as { type?: string }).type).toBe('object')
})

test('mcpCall runs the tool and returns MCP content', async () => {
  const r = await mcpCall(registry(), ctx(), gate(), 'echo', { text: 'hi' })
  expect(r.isError).toBe(false)
  expect(r.content[0]?.text).toBe('you said: hi')
})

test('mcpCall flags an unknown tool as an error', async () => {
  const r = await mcpCall(registry(), ctx(), gate(), 'nope', {})
  expect(r.isError).toBe(true)
  expect(r.content[0]?.text).toContain('unknown tool')
})
