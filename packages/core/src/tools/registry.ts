import { zodToJsonSchema } from 'zod-to-json-schema'
import type { BrainMessage } from '../brain/types'
import type { ApprovalGate } from '../permission/approvals'
import type { ToolCall, ToolContext, ToolDef, ToolSchema } from './types'

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDef>()

  register(tool: ToolDef): void {
    if (this.tools.has(tool.name)) throw new Error(`tool already registered: ${tool.name}`)
    this.tools.set(tool.name, tool)
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  list(): ToolDef[] {
    return [...this.tools.values()]
  }

  /** OpenAI-style tool advertisements — a tool's `parametersOverride`, else its zod schema. */
  schemas(): ToolSchema[] {
    return this.list().map(t => ({
      name: t.name,
      description: t.description,
      parameters: sanitizeJsonSchema(
        t.parametersOverride ??
          (zodToJsonSchema(t.schema, { target: 'openApi3' }) as Record<string, unknown>),
      ),
    }))
  }

  /**
   * Validate args, run the approval gate, execute, and return a `tool` role
   * message ready to feed back to the brain. Never throws — failures become
   * an error message the brain can react to.
   */
  async dispatch(call: ToolCall, ctx: ToolContext, gate: ApprovalGate): Promise<BrainMessage> {
    const tool = this.tools.get(call.name)
    if (!tool) return toolMsg(call.id, `error: unknown tool "${call.name}"`)

    const parsed = tool.schema.safeParse(call.args)
    if (!parsed.success) return toolMsg(call.id, `error: invalid args: ${parsed.error.message}`)

    const decision = await gate.check(call, tool)
    if (!decision.allowed)
      return toolMsg(call.id, `denied: ${decision.reason ?? 'approval refused'}`)

    try {
      const result = await tool.run(parsed.data, ctx)
      return toolMsg(call.id, result.content)
    } catch (err) {
      return toolMsg(call.id, `error: ${(err as Error).message}`)
    }
  }
}

function toolMsg(toolCallId: string, content: string): BrainMessage {
  return { role: 'tool', content, toolCallId }
}

/**
 * Normalize a JSON Schema for strict validators. Venice/OpenAI validate tool
 * `parameters` against JSON Schema 2020-12, where `exclusiveMinimum`/`exclusiveMaximum`
 * must be *numbers*. The OpenAPI-3 target (and some MCP servers) emit them as
 * *booleans* paired with `minimum`/`maximum`; convert in place so one tool's
 * `.positive()` can't make the model reject the entire tool list.
 */
export function sanitizeJsonSchema(node: unknown): Record<string, unknown> {
  return walkSchema(node) as Record<string, unknown>
}

const BOUND_KEYS = new Set(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'])

function walkSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(walkSchema)
  if (!node || typeof node !== 'object') return node
  const src = node as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(src)) {
    if (!BOUND_KEYS.has(k)) out[k] = walkSchema(v)
  }
  normalizeBound(out, src, 'exclusiveMinimum', 'minimum')
  normalizeBound(out, src, 'exclusiveMaximum', 'maximum')
  return out
}

/** Fold an OpenAPI-3 boolean exclusive bound into the JSON-Schema-2020 numeric form. */
function normalizeBound(
  out: Record<string, unknown>,
  src: Record<string, unknown>,
  exKey: string,
  inKey: string,
): void {
  const ex = src[exKey]
  if (ex === true) {
    if (typeof src[inKey] === 'number') out[exKey] = src[inKey] // ">" → numeric exclusive bound
  } else {
    if (ex !== false && ex !== undefined) out[exKey] = ex // already numeric — keep
    if (src[inKey] !== undefined) out[inKey] = src[inKey] // inclusive bound
  }
}
