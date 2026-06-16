import type { ToolDef } from '@compass_agents/core'
import { z } from 'zod'

/**
 * MCP (Model Context Protocol) client. Connect the agent to any MCP server and
 * inherit its tools — databases, filesystems, GitHub, Slack, hundreds more —
 * exposed to the brain as compass tools. The SDK is an optional dependency loaded
 * lazily, and a server that fails to start is skipped, so the agent always works.
 */

export interface McpToolInfo {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface McpCallResult {
  content?: Array<{ type: string; text?: string }>
  isError?: boolean
}

/** The slice of an MCP client we use; the official SDK's Client satisfies it. */
export interface McpClientLike {
  listTools(): Promise<{ tools: McpToolInfo[] }>
  callTool(req: { name: string; arguments: unknown }): Promise<McpCallResult>
}

export interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_.-]/g, '_')

/** Render an MCP tool result's text content into a compass ToolResult. */
export function renderMcpResult(res: McpCallResult): { content: string; ok: boolean } {
  const text = (res.content ?? [])
    .filter(c => c.type === 'text' && typeof c.text === 'string')
    .map(c => c.text)
    .join('\n')
  return {
    content: text || (res.isError ? 'MCP tool returned an error' : '(no output)'),
    ok: !res.isError,
  }
}

/** Adapt an MCP server's tools into compass ToolDefs the brain can call. */
export function mcpToolsFromClient(
  client: McpClientLike,
  server: string,
  tools: McpToolInfo[],
): ToolDef[] {
  return tools.map(t => ({
    name: `mcp.${sanitize(server)}.${sanitize(t.name)}`,
    description: t.description ?? `MCP tool "${t.name}" from ${server}`,
    schema: z.record(z.unknown()),
    // External tools advertise their own JSON Schema; require approval to run.
    ...(t.inputSchema ? { parametersOverride: t.inputSchema } : {}),
    dangerous: true,
    run: async (args: unknown) =>
      renderMcpResult(await client.callTool({ name: t.name, arguments: args })),
  }))
}

/**
 * Connect to each configured MCP server and return all their tools. A server that
 * fails to start is skipped (logged via `onError`) — a bad entry can't break the agent.
 */
export async function loadMcpTools(
  servers: Record<string, McpServerConfig>,
  opts: {
    connect?: (name: string, cfg: McpServerConfig) => Promise<McpClientLike>
    onError?: (name: string, err: unknown) => void
  } = {},
): Promise<ToolDef[]> {
  const connect = opts.connect ?? defaultConnect
  const out: ToolDef[] = []
  for (const [name, cfg] of Object.entries(servers)) {
    try {
      const client = await connect(name, cfg)
      const { tools } = await client.listTools()
      out.push(...mcpToolsFromClient(client, name, tools))
    } catch (err) {
      opts.onError?.(name, err)
    }
  }
  return out
}

/** Default transport: spawn the server over stdio via the official MCP SDK. */
async function defaultConnect(_name: string, cfg: McpServerConfig): Promise<McpClientLike> {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
  const transport = new StdioClientTransport({
    command: cfg.command,
    args: cfg.args ?? [],
    ...(cfg.env ? { env: cfg.env } : {}),
  })
  const client = new Client({ name: 'compass', version: '0.1.0' }, { capabilities: {} })
  await client.connect(transport)
  return client as unknown as McpClientLike
}
