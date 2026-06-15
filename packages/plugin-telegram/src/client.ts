import type { InlineKeyboardMarkup } from './approval-keyboard'

/** Bot API subset compass uses. Raw HTTP over fetch — no grammy. */

export interface TgUser {
  id: number
  is_bot: boolean
  first_name?: string
  username?: string
}

export interface TgMessage {
  message_id: number
  from?: TgUser
  chat: { id: number; type: string }
  text?: string
}

export interface TgCallbackQuery {
  id: string
  from: TgUser
  data?: string
  message?: TgMessage
}

export interface TgUpdate {
  update_id: number
  message?: TgMessage
  callback_query?: TgCallbackQuery
}

export interface SendMessageOpts {
  parseMode?: 'MarkdownV2' | 'HTML'
  replyMarkup?: InlineKeyboardMarkup
  replyTo?: number
}

export type FetchImpl = typeof fetch

export interface TelegramClientOpts {
  token: string
  fetchImpl?: FetchImpl
  /** Override the API base (tests). */
  baseUrl?: string
}

interface ApiResponse<T> {
  ok: boolean
  result?: T
  description?: string
}

/** Thin Telegram Bot API client: getUpdates long-poll + the send/answer methods. */
export class TelegramClient {
  private readonly base: string
  private readonly fetchImpl: FetchImpl

  constructor(opts: TelegramClientOpts) {
    this.base = `${opts.baseUrl ?? 'https://api.telegram.org'}/bot${opts.token}`
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  private async call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await this.fetchImpl(`${this.base}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as ApiResponse<T>
    if (!json.ok) throw new Error(`telegram ${method} failed: ${json.description ?? res.status}`)
    return json.result as T
  }

  /** Long-poll for updates after `offset`. `timeout` is server-side seconds. */
  getUpdates(offset: number, timeout = 25): Promise<TgUpdate[]> {
    return this.call<TgUpdate[]>('getUpdates', {
      offset,
      timeout,
      allowed_updates: ['message', 'callback_query'],
    })
  }

  sendMessage(
    chatId: number | string,
    text: string,
    opts: SendMessageOpts = {},
  ): Promise<TgMessage> {
    return this.call<TgMessage>('sendMessage', {
      chat_id: chatId,
      text,
      ...(opts.parseMode ? { parse_mode: opts.parseMode } : {}),
      ...(opts.replyMarkup ? { reply_markup: opts.replyMarkup } : {}),
      ...(opts.replyTo ? { reply_to_message_id: opts.replyTo } : {}),
    })
  }

  sendChatAction(chatId: number | string, action = 'typing'): Promise<boolean> {
    return this.call<boolean>('sendChatAction', { chat_id: chatId, action })
  }

  answerCallbackQuery(id: string, text?: string): Promise<boolean> {
    return this.call<boolean>('answerCallbackQuery', {
      callback_query_id: id,
      ...(text ? { text } : {}),
    })
  }

  getMe(): Promise<TgUser> {
    return this.call<TgUser>('getMe', {})
  }
}
