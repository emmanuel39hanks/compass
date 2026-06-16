import type { ApprovalGate, ToolContext, ToolRegistry } from '@compass_agents/core'

/**
 * Expose compass's own tools *as* an MCP server, so any MCP client (Claude
 * Desktop, Cursor, another agent…) can use compass to send USDC, hire agents,
 * pay x402 paywalls, discover services, and check reputation. The `compass-mcp`
 * bin wires these two pure functions to an stdio MCP Server.
 */

export interface McpToolListItem {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** Advertise the registry's tools in MCP's tools/list shape. */
export function mcpToolList(tools: ToolRegistry): McpToolListItem[] {
  return tools
    .schemas()
    .map(s => ({ name: s.name, description: s.description, inputSchema: s.parameters }))
}

export interface McpCallResult {
  content: Array<{ type: 'text'; text: string }>
  isError: boolean
}

/** Run a tool by name (MCP tools/call) and return its result in MCP shape. */
export async function mcpCall(
  tools: ToolRegistry,
  ctx: ToolContext,
  gate: ApprovalGate,
  name: string,
  args: unknown,
): Promise<McpCallResult> {
  const msg = await tools.dispatch({ id: 'mcp', name, args }, ctx, gate)
  const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
  const isError = text.startsWith('error:') || text.startsWith('denied:')
  return { content: [{ type: 'text', text }], isError }
}
