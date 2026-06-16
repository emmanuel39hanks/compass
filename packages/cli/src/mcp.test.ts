import { expect, test } from 'bun:test'
import type { ToolContext } from '@compass_agents/core'
import { type McpClientLike, loadMcpTools, mcpToolsFromClient, renderMcpResult } from './mcp'

const ctx = (): ToolContext => ({ memory: undefined as never })

function mockClient(calls: Array<{ name: string; arguments: unknown }>): McpClientLike {
  return {
    listTools: async () => ({
      tools: [
        {
          name: 'read_file',
          description: 'Read a file',
          inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
        },
      ],
    }),
    callTool: async req => {
      calls.push(req)
      return {
        content: [
          { type: 'text', text: `contents of ${(req.arguments as { path: string }).path}` },
        ],
      }
    },
  }
}

test('renderMcpResult joins text content + maps isError', () => {
  expect(renderMcpResult({ content: [{ type: 'text', text: 'hi' }] })).toEqual({
    content: 'hi',
    ok: true,
  })
  expect(renderMcpResult({ isError: true }).ok).toBe(false)
})

test('mcpToolsFromClient namespaces tools + advertises the MCP schema', () => {
  const tools = mcpToolsFromClient(mockClient([]), 'fs', [
    {
      name: 'read_file',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    },
  ])
  expect(tools[0]?.name).toBe('mcp.fs.read_file')
  expect(tools[0]?.dangerous).toBe(true)
  expect(tools[0]?.parametersOverride).toEqual({
    type: 'object',
    properties: { path: { type: 'string' } },
  })
})

test('an MCP tool routes its call to the server', async () => {
  const calls: Array<{ name: string; arguments: unknown }> = []
  const [tool] = mcpToolsFromClient(mockClient(calls), 'fs', [{ name: 'read_file' }])
  const r = await tool!.run({ path: '/etc/hosts' }, ctx())
  expect(r.ok).toBe(true)
  expect(r.content).toBe('contents of /etc/hosts')
  expect(calls[0]).toEqual({ name: 'read_file', arguments: { path: '/etc/hosts' } })
})

test('loadMcpTools collects tools + skips a failing server', async () => {
  const errors: string[] = []
  const tools = await loadMcpTools(
    { good: { command: 'x' }, bad: { command: 'y' } },
    {
      connect: async name => {
        if (name === 'bad') throw new Error('spawn failed')
        return mockClient([])
      },
      onError: name => errors.push(name),
    },
  )
  expect(tools.map(t => t.name)).toEqual(['mcp.good.read_file'])
  expect(errors).toEqual(['bad'])
})
