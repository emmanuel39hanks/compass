import type {
  BrainInferInput,
  BrainMessage,
  BrainTurn,
  ToolCall,
  ToolSchema,
} from '@compass_agents/core'

export const VENICE_BASE_URL = 'https://api.venice.ai/api/v1'
export const DEFAULT_VENICE_MODEL = 'qwen3-next-80b'

export interface WireToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface WireMessage {
  role: string
  content: string | null
  tool_calls?: WireToolCall[]
  tool_call_id?: string
}

export interface ChatRequest {
  model: string
  messages: WireMessage[]
  tools?: Array<{ type: 'function'; function: ToolSchema }>
  tool_choice?: 'auto'
  parallel_tool_calls?: boolean
  max_tokens?: number
  venice_parameters?: Record<string, unknown>
}

export interface VeniceChatResponse {
  choices?: Array<{ message?: WireMessage; finish_reason?: string }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
  }
}

/** Map compass messages to OpenAI-compatible wire messages (system prepended). */
export function toWireMessages(system: string, messages: BrainMessage[]): WireMessage[] {
  const out: WireMessage[] = []
  if (system) out.push({ role: 'system', content: system })
  for (const m of messages) {
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      out.push({
        role: 'assistant',
        content: m.content ?? '',
        tool_calls: m.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
        })),
      })
    } else if (m.role === 'tool') {
      out.push({ role: 'tool', content: m.content, tool_call_id: m.toolCallId })
    } else {
      out.push({ role: m.role, content: m.content })
    }
  }
  return out
}

export function toWireTools(
  tools: ToolSchema[],
): Array<{ type: 'function'; function: ToolSchema }> {
  return tools.map(t => ({ type: 'function', function: t }))
}

export interface BuildChatRequestOpts {
  model: string
  maxOutputTokens?: number
  veniceParameters?: Record<string, unknown>
}

export function buildChatRequest(input: BrainInferInput, opts: BuildChatRequestOpts): ChatRequest {
  const req: ChatRequest = {
    model: opts.model,
    messages: toWireMessages(input.system, input.messages),
  }
  if (input.tools.length > 0) {
    req.tools = toWireTools(input.tools)
    req.tool_choice = 'auto'
    req.parallel_tool_calls = true
  }
  const maxTokens = input.maxOutputTokens ?? opts.maxOutputTokens
  if (maxTokens) req.max_tokens = maxTokens
  if (opts.veniceParameters) req.venice_parameters = opts.veniceParameters
  return req
}

export function parseTurn(json: VeniceChatResponse): BrainTurn {
  const choice = json.choices?.[0]
  const msg = choice?.message
  const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map(tc => ({
    id: tc.id,
    name: tc.function.name,
    args: safeParseJson(tc.function.arguments),
  }))
  const turn: BrainTurn = { content: msg?.content ?? null, toolCalls }
  if (choice?.finish_reason) turn.finishReason = choice.finish_reason
  if (json.usage) {
    turn.usage = {
      promptTokens: json.usage.prompt_tokens,
      completionTokens: json.usage.completion_tokens,
      totalTokens: json.usage.total_tokens,
      cachedTokens: json.usage.prompt_tokens_details?.cached_tokens,
    }
  }
  return turn
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}
