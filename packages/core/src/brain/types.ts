import type { ToolCall, ToolSchema } from '../tools/types'

export interface BrainMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  /** Required on `tool` role: the id of the assistant tool_call this answers. */
  toolCallId?: string
  /** Required on `assistant` messages that issued tool calls. */
  toolCalls?: ToolCall[]
}

export interface BrainInferInput {
  system: string
  messages: BrainMessage[]
  tools: ToolSchema[]
  signal?: AbortSignal
  maxOutputTokens?: number
}

export interface BrainUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  cachedTokens?: number
}

export interface BrainTurn {
  content: string | null
  toolCalls: ToolCall[]
  finishReason?: string
  usage?: BrainUsage
}

/** OpenAI-tool-calling-shaped contract; any compatible model drops in. */
export interface Brain {
  infer(input: BrainInferInput): Promise<BrainTurn>
  clearChannel?(channelKey?: string): void | Promise<void>
}
