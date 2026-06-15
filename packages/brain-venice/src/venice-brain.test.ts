import { expect, test } from 'bun:test'
import { type FetchImpl, VeniceBrain } from './venice-brain'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test('infer parses tool calls and usage', async () => {
  const fetchImpl = (() =>
    Promise.resolve(
      jsonResponse(200, {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 't1',
                  type: 'function',
                  function: { name: 'add', arguments: '{"a":1,"b":2}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    )) as unknown as FetchImpl
  const brain = new VeniceBrain({ apiKey: 'k', model: 'qwen', fetchImpl })
  const turn = await brain.infer({
    system: 's',
    messages: [{ role: 'user', content: 'hi' }],
    tools: [],
  })
  expect(turn.toolCalls).toHaveLength(1)
  expect(turn.toolCalls[0]?.args).toEqual({ a: 1, b: 2 })
  expect(turn.usage?.promptTokens).toBe(10)
})

test('infer throws on a non-ok status', async () => {
  const fetchImpl = (() =>
    Promise.resolve(jsonResponse(401, { error: 'nope' }))) as unknown as FetchImpl
  const brain = new VeniceBrain({ apiKey: 'k', fetchImpl })
  await expect(brain.infer({ system: '', messages: [], tools: [] })).rejects.toThrow('venice 401')
})

test('infer targets the chat endpoint with bearer auth', async () => {
  let url = ''
  let body: { model?: string; messages?: Array<{ role: string }> } = {}
  let auth = ''
  const fetchImpl = ((u: string, init: RequestInit) => {
    url = u
    body = JSON.parse(String(init.body))
    auth = (init.headers as Record<string, string>).authorization ?? ''
    return Promise.resolve(
      jsonResponse(200, { choices: [{ message: { role: 'assistant', content: 'ok' } }] }),
    )
  }) as unknown as FetchImpl
  const brain = new VeniceBrain({ apiKey: 'secret', model: 'qwen3', fetchImpl })
  await brain.infer({ system: 'sys', messages: [{ role: 'user', content: 'hi' }], tools: [] })
  expect(url).toContain('/chat/completions')
  expect(body.model).toBe('qwen3')
  expect(body.messages?.[0]?.role).toBe('system')
  expect(auth).toBe('Bearer secret')
})
