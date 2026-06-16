import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type BrainTurn,
  MemoryStore,
  StubBrain,
  type ToolContext,
  type ToolDef,
  ToolRegistry,
} from '@compass_agents/core'
import { Gateway } from '@compass_agents/gateway'
import { z } from 'zod'
import type { SendMessageOpts, TelegramClient, TgMessage, TgUpdate } from './client'
import { TelegramListener } from './listener'

interface SentMessage {
  chatId: number | string
  text: string
  opts: SendMessageOpts
}

/** Records every Bot API call the listener makes; satisfies the used subset. */
function mockClient() {
  const sent: SentMessage[] = []
  const typing: Array<number | string> = []
  const answered: Array<{ id: string; text?: string }> = []
  const client = {
    getUpdates: async () => [],
    sendMessage: async (chatId: number | string, text: string, opts: SendMessageOpts = {}) => {
      sent.push({ chatId, text, opts })
      return {
        message_id: sent.length,
        chat: { id: Number(chatId), type: 'private' },
        text,
      } as TgMessage
    },
    sendChatAction: async (chatId: number | string) => {
      typing.push(chatId)
      return true
    },
    answerCallbackQuery: async (id: string, text?: string) => {
      answered.push({ id, ...(text ? { text } : {}) })
      return true
    },
  } as unknown as TelegramClient
  return { client, sent, typing, answered }
}

async function gatewayWith(script: BrainTurn[], tool?: ToolDef) {
  const tools = new ToolRegistry()
  if (tool) tools.register(tool)
  const memory = new MemoryStore(await mkdtemp(join(tmpdir(), 'compass-tg-')))
  return new Gateway({ brain: new StubBrain(script), tools, memory, system: 'sys' })
}

const msgUpdate = (id: number, text: string, fromId = 5): TgUpdate => ({
  update_id: id,
  message: {
    message_id: id,
    from: { id: fromId, is_bot: false },
    chat: { id: 100, type: 'private' },
    text,
  },
})

test('a plain message → typing indicator + the brain reply', async () => {
  const gw = await gatewayWith([{ content: 'hi there', toolCalls: [] }])
  const { client, sent, typing } = mockClient()
  const tg = new TelegramListener({ client, gateway: gw })
  await tg.handleUpdate(msgUpdate(1, 'hello'))
  expect(typing.length).toBeGreaterThan(0)
  expect(sent.map(s => s.text)).toEqual(['hi there'])
  expect(sent[0]?.chatId).toBe('100')
})

test('messages from non-allowlisted users are dropped', async () => {
  const gw = await gatewayWith([{ content: 'should not run', toolCalls: [] }])
  const { client, sent } = mockClient()
  const tg = new TelegramListener({ client, gateway: gw, allowedUserIds: [5] })
  await tg.handleUpdate(msgUpdate(1, 'hello', 999)) // user 999 not allowed
  expect(sent.length).toBe(0)
})

test('a long reply is chunked into multiple sends', async () => {
  const gw = await gatewayWith([{ content: 'a '.repeat(3000), toolCalls: [] }])
  const { client, sent } = mockClient()
  const tg = new TelegramListener({ client, gateway: gw })
  await tg.handleUpdate(msgUpdate(1, 'go'))
  expect(sent.length).toBe(2)
})

test('dangerous tool → approval keyboard, button press runs it', async () => {
  const ran = { count: 0 }
  const danger: ToolDef<Record<string, never>> = {
    name: 'chain.send',
    description: 'send funds',
    dangerous: true,
    schema: z.object({}),
    run: (_a, _c: ToolContext) => {
      ran.count++
      return { content: 'sent', ok: true }
    },
  }
  const gw = await gatewayWith(
    [
      { content: null, toolCalls: [{ id: '1', name: 'chain.send', args: {} }] },
      { content: 'all done', toolCalls: [] },
    ],
    danger,
  )
  const { client, sent, answered } = mockClient()
  const tg = new TelegramListener({ client, gateway: gw, approvalTimeoutMs: 5000 })

  // Start handling the message — it will block awaiting the approval.
  const turn = tg.handleUpdate(msgUpdate(1, 'send 1 USDC'))
  await new Promise(r => setTimeout(r, 10)) // let the keyboard send + resolver register

  const keyboardMsg = sent.find(s => s.opts.replyMarkup)
  expect(keyboardMsg).toBeDefined()
  const data = keyboardMsg?.opts.replyMarkup?.inline_keyboard[0]?.[0]?.callback_data
  expect(data).toBe('ea:once:a-1')

  // The operator taps "Allow Once".
  await tg.handleUpdate({
    update_id: 2,
    callback_query: { id: 'cb1', from: { id: 5, is_bot: false }, data },
  })
  await turn

  expect(ran.count).toBe(1)
  expect(sent.some(s => s.text === 'all done')).toBe(true)
  expect(answered).toContainEqual({ id: 'cb1', text: 'Approved' })
})

test('poll loop does not deadlock: an approval arriving mid-turn is processed', async () => {
  // Regression: the message handler blocks awaiting an approval. The button press
  // arrives as a *separate* update — the poll loop must stay free to fetch it,
  // otherwise the approval dead-times-out and only read-only tools ever work.
  const ran = { count: 0 }
  const danger: ToolDef<Record<string, never>> = {
    name: 'chain.send',
    description: 'send funds',
    dangerous: true,
    schema: z.object({}),
    run: () => {
      ran.count++
      return { content: 'sent', ok: true }
    },
  }
  const gw = await gatewayWith(
    [
      { content: null, toolCalls: [{ id: '1', name: 'chain.send', args: {} }] },
      { content: 'all done', toolCalls: [] },
    ],
    danger,
  )
  const { client, sent } = mockClient()

  let polls = 0
  let callbackSent = false
  // First poll yields the message; later polls surface the operator's button press
  // once the approval keyboard has been sent.
  ;(client as unknown as { getUpdates: TelegramClient['getUpdates'] }).getUpdates = async () => {
    polls++
    await new Promise(r => setTimeout(r, 5))
    if (polls === 1) return [msgUpdate(1, 'send 1 USDC')]
    const kb = sent.find(s => s.opts.replyMarkup)
    if (kb && !callbackSent) {
      callbackSent = true
      const data = kb.opts.replyMarkup?.inline_keyboard[0]?.[0]?.callback_data
      return [
        { update_id: 2, callback_query: { id: 'cb1', from: { id: 5, is_bot: false }, data } },
      ] as TgUpdate[]
    }
    return []
  }

  const tg = new TelegramListener({ client, gateway: gw, approvalTimeoutMs: 3000 })
  void tg.start()
  const deadline = Date.now() + 2000
  while (ran.count === 0 && Date.now() < deadline) await new Promise(r => setTimeout(r, 10))
  tg.stop()

  expect(ran.count).toBe(1) // the tool ran → the approval was NOT deadlocked
  expect(sent.some(s => s.text === 'all done')).toBe(true)
})

test('unpaired sender gets a pairing prompt (gateway pairing)', async () => {
  const { PairingStore } = await import('@compass_agents/gateway')
  const pairing = new PairingStore({ genCode: () => 'PAIR42' })
  const tools = new ToolRegistry()
  const memory = new MemoryStore(await mkdtemp(join(tmpdir(), 'compass-tg-')))
  const gw = new Gateway({
    brain: new StubBrain([{ content: 'x', toolCalls: [] }]),
    tools,
    memory,
    system: 'sys',
    pairing,
  })
  const { client, sent } = mockClient()
  const tg = new TelegramListener({ client, gateway: gw })
  await tg.handleUpdate(msgUpdate(1, 'hi'))
  expect(sent[0]?.text).toContain('PAIR42')
})
