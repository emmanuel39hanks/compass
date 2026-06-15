import { expect, test } from 'bun:test'
import { buildChatRequest, parseTurn, toWireMessages } from './wire'

test('buildChatRequest includes system, messages, and tools', () => {
  const req = buildChatRequest(
    {
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 't', description: 'd', parameters: { type: 'object' } }],
    },
    { model: 'm' },
  )
  expect(req.model).toBe('m')
  expect(req.messages[0]).toEqual({ role: 'system', content: 'sys' })
  expect(req.tools?.[0]?.function.name).toBe('t')
  expect(req.tool_choice).toBe('auto')
  expect(req.parallel_tool_calls).toBe(true)
})

test('buildChatRequest omits tools when there are none', () => {
  const req = buildChatRequest({ system: '', messages: [], tools: [] }, { model: 'm' })
  expect(req.tools).toBeUndefined()
  expect(req.tool_choice).toBeUndefined()
})

test('toWireMessages maps assistant tool calls and tool replies', () => {
  const wire = toWireMessages('', [
    { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'add', args: { a: 1 } }] },
    { role: 'tool', content: '2', toolCallId: 't1' },
  ])
  expect(wire[0]?.tool_calls?.[0]).toEqual({
    id: 't1',
    type: 'function',
    function: { name: 'add', arguments: '{"a":1}' },
  })
  expect(wire[1]).toEqual({ role: 'tool', content: '2', tool_call_id: 't1' })
})

test('parseTurn extracts content, tool calls, and usage', () => {
  const turn = parseTurn({
    choices: [
      {
        message: {
          role: 'assistant',
          content: 'hello',
          tool_calls: [
            { id: 'a', type: 'function', function: { name: 'f', arguments: '{"x":1}' } },
          ],
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 3,
      completion_tokens: 4,
      total_tokens: 7,
      prompt_tokens_details: { cached_tokens: 2 },
    },
  })
  expect(turn.content).toBe('hello')
  expect(turn.toolCalls[0]).toEqual({ id: 'a', name: 'f', args: { x: 1 } })
  expect(turn.usage?.cachedTokens).toBe(2)
  expect(turn.finishReason).toBe('stop')
})
