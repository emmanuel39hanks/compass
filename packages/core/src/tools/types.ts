import type { z } from 'zod'
import type { MemoryStore } from '../memory/store'

/** A tool invocation requested by the brain. */
export interface ToolCall {
  id: string
  name: string
  args: unknown
}

/** OpenAI-style tool advertisement handed to the brain. */
export interface ToolSchema {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolResult {
  content: string
  ok: boolean
}

/**
 * Side-band services available to a tool at execution time. Plugins attach
 * extra context (e.g. `onchain`, `a2a`) via the index signature.
 */
export interface ToolContext {
  memory: MemoryStore
  signal?: AbortSignal
  [key: string]: unknown
}

export interface ToolDef<A = unknown> {
  name: string
  description: string
  /** zod validator; doubles as the source for the advertised JSON schema. */
  schema: z.ZodType<A>
  /**
   * Advertise this exact JSON Schema to the brain instead of deriving it from
   * `schema`. For tools whose schema is already JSON Schema (e.g. MCP tools),
   * so the brain sees the real input shape while `schema` stays a permissive
   * validator.
   */
  parametersOverride?: Record<string, unknown>
  /** Marks the tool as requiring approval in `prompt` mode. */
  dangerous?: boolean
  run(args: A, ctx: ToolContext): Promise<ToolResult> | ToolResult
}
