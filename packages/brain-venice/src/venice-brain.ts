import type { Brain, BrainInferInput, BrainTurn } from '@compass_agents/core'
import type { VeniceChatResponse } from './wire'
import { DEFAULT_VENICE_MODEL, VENICE_BASE_URL, buildChatRequest, parseTurn } from './wire'

export type FetchImpl = typeof fetch

export interface VeniceBrainOpts {
  apiKey: string
  model?: string
  baseUrl?: string
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: FetchImpl
  maxOutputTokens?: number
  /** Venice-specific knobs, e.g. { enable_web_search: 'auto' }. */
  veniceParameters?: Record<string, unknown>
}

/**
 * Venice AI brain. Venice exposes an OpenAI-compatible chat/completions
 * endpoint with tool calling, so this implements the @compass_agents/core `Brain`
 * contract by translating to/from the OpenAI wire format.
 */
export class VeniceBrain implements Brain {
  private readonly baseUrl: string
  private readonly model: string
  private readonly fetchImpl: FetchImpl

  constructor(private readonly opts: VeniceBrainOpts) {
    this.baseUrl = (opts.baseUrl ?? VENICE_BASE_URL).replace(/\/+$/, '')
    this.model = opts.model ?? DEFAULT_VENICE_MODEL
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  async infer(input: BrainInferInput): Promise<BrainTurn> {
    const requestOpts: {
      model: string
      maxOutputTokens?: number
      veniceParameters?: Record<string, unknown>
    } = {
      model: this.model,
    }
    if (this.opts.maxOutputTokens !== undefined)
      requestOpts.maxOutputTokens = this.opts.maxOutputTokens
    if (this.opts.veniceParameters) requestOpts.veniceParameters = this.opts.veniceParameters

    const body = buildChatRequest(input, requestOpts)
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify(body),
      ...(input.signal ? { signal: input.signal } : {}),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`venice ${res.status}: ${text.slice(0, 400)}`)
    }
    return parseTurn((await res.json()) as VeniceChatResponse)
  }
}

/** Fetch the live model catalog (`GET /models`) — IDs drift, resolve at runtime. */
export async function listVeniceModels(opts: {
  apiKey: string
  baseUrl?: string
  fetchImpl?: FetchImpl
}): Promise<string[]> {
  const baseUrl = (opts.baseUrl ?? VENICE_BASE_URL).replace(/\/+$/, '')
  const f = opts.fetchImpl ?? fetch
  const res = await f(`${baseUrl}/models`, {
    headers: { authorization: `Bearer ${opts.apiKey}` },
  })
  if (!res.ok) throw new Error(`venice models ${res.status}`)
  const json = (await res.json()) as { data?: Array<{ id?: string }> }
  return (json.data ?? []).map(m => m.id).filter((id): id is string => typeof id === 'string')
}
