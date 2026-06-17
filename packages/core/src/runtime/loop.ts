import type { Brain, BrainMessage } from '../brain/types'
import type { CompassEvent } from '../events/types'
import type { ApprovalGate } from '../permission/approvals'
import type { ToolRegistry } from '../tools/registry'
import type { ToolContext } from '../tools/types'

export interface RunTurnOpts {
  brain: Brain
  tools: ToolRegistry
  gate: ApprovalGate
  ctx: ToolContext
  system: string
  history?: BrainMessage[]
  maxIterations?: number
  /** Fired before each brain inference (so a UI can show a "thinking…" state). */
  onThink?: () => void
  onToolStart?: (name: string) => void
  /** Fired with each tool's raw result text — so a UI can show what the agent actually saw. */
  onToolResult?: (name: string, content: string) => void
}

export interface RunTurnResult {
  content: string
  history: BrainMessage[]
  iterations: number
}

export const DEFAULT_MAX_ITERATIONS = 12

/**
 * The harness loop: event wakes the brain, the brain returns tool calls, each
 * call passes the approval gate and executes, results feed back, repeat until
 * the brain returns content or `maxIterations` is hit.
 */
export async function runTurn(event: CompassEvent, opts: RunTurnOpts): Promise<RunTurnResult> {
  const max = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS
  const history: BrainMessage[] = [...(opts.history ?? [])]
  history.push({ role: 'user', content: event.text })

  for (let i = 1; i <= max; i++) {
    opts.onThink?.()
    const turn = await opts.brain.infer({
      system: opts.system,
      messages: history,
      tools: opts.tools.schemas(),
      signal: opts.ctx.signal,
    })

    if (turn.toolCalls.length === 0) {
      const content = turn.content ?? ''
      history.push({ role: 'assistant', content })
      return { content, history, iterations: i }
    }

    history.push({ role: 'assistant', content: turn.content ?? '', toolCalls: turn.toolCalls })

    for (const call of turn.toolCalls) {
      opts.onToolStart?.(call.name)
      const msg = await opts.tools.dispatch(call, opts.ctx, opts.gate)
      if (opts.onToolResult && typeof msg.content === 'string')
        opts.onToolResult(call.name, msg.content)
      history.push(msg)
    }
  }

  const content = `(stopped after ${max} iterations without a final answer)`
  history.push({ role: 'assistant', content })
  return { content, history, iterations: max }
}
