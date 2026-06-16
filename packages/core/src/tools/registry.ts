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
      parameters:
        t.parametersOverride ??
        (zodToJsonSchema(t.schema, { target: 'openApi3' }) as Record<string, unknown>),
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
