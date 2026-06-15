import type { ApprovalChoice, Gateway } from '@compass_agents/gateway'
import {
  buildApprovalKeyboard,
  handleApprovalCallback,
  makeApprovalIdFactory,
} from './approval-keyboard'
import { splitMessage } from './chunking'
import type { TelegramClient, TgUpdate } from './client'

export interface TelegramListenerOpts {
  client: TelegramClient
  gateway: Gateway
  /** Static allowlist of Telegram user ids. Empty → rely on the gateway's pairing. */
  allowedUserIds?: number[]
  /** Server-side long-poll seconds. Default 25. */
  pollTimeout?: number
  /** How long to wait for an inline-keyboard approval before denying. Default 120s. */
  approvalTimeoutMs?: number
  onError?: (err: unknown) => void
  /** Sleep impl (injectable for tests). */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/**
 * The Telegram surface: long-polls the Bot API, routes each message through the
 * gateway, and streams the reply back (chunked). Dangerous-tool approvals appear
 * as inline-keyboard buttons; a button press resolves the pending approval.
 */
export class TelegramListener {
  private readonly client: TelegramClient
  private readonly gateway: Gateway
  private readonly allowedUserIds: number[]
  private readonly pollTimeout: number
  private readonly approvalTimeoutMs: number
  private readonly onError: (err: unknown) => void
  private readonly sleep: (ms: number) => Promise<void>

  private offset = 0
  private running = false
  private readonly pending = new Map<string, (choice: ApprovalChoice) => void>()
  private readonly nextApprovalId = makeApprovalIdFactory()

  constructor(opts: TelegramListenerOpts) {
    this.client = opts.client
    this.gateway = opts.gateway
    this.allowedUserIds = opts.allowedUserIds ?? []
    this.pollTimeout = opts.pollTimeout ?? 25
    this.approvalTimeoutMs = opts.approvalTimeoutMs ?? 120_000
    this.onError = opts.onError ?? (() => {})
    this.sleep = opts.sleep ?? defaultSleep
  }

  /** Run the long-poll loop until {@link stop}. */
  async start(): Promise<void> {
    this.running = true
    while (this.running) {
      let updates: TgUpdate[]
      try {
        updates = await this.client.getUpdates(this.offset, this.pollTimeout)
      } catch (err) {
        this.onError(err)
        await this.sleep(1000)
        continue
      }
      for (const u of updates) {
        this.offset = u.update_id + 1
        try {
          await this.handleUpdate(u)
        } catch (err) {
          this.onError(err)
        }
      }
    }
  }

  stop(): void {
    this.running = false
  }

  /** Process a single update (message or callback). Exposed for tests. */
  async handleUpdate(update: TgUpdate): Promise<void> {
    if (update.callback_query) return this.onCallback(update.callback_query)
    const msg = update.message
    if (!msg?.text) return
    const userId = msg.from?.id
    if (
      this.allowedUserIds.length > 0 &&
      (userId === undefined || !this.allowedUserIds.includes(userId))
    ) {
      return // not on the static allowlist — drop silently
    }
    const chatId = String(msg.chat.id)
    await this.client.sendChatAction(chatId, 'typing').catch(() => {})
    const reply = await this.gateway.handleMessage(
      { surface: 'telegram', chatId, text: msg.text },
      {
        onStart: () => {
          this.client.sendChatAction(chatId, 'typing').catch(() => {})
        },
        approve: ask =>
          new Promise<ApprovalChoice>(resolve => {
            const id = this.nextApprovalId()
            const timer = setTimeout(() => {
              this.pending.delete(id)
              resolve('deny')
            }, this.approvalTimeoutMs)
            this.pending.set(id, choice => {
              clearTimeout(timer)
              resolve(choice)
            })
            this.client
              .sendMessage(ask.chatId, `🔐 Approve \`${ask.tool}\`?\n${ask.summary}`, {
                replyMarkup: buildApprovalKeyboard(id),
              })
              .catch(err => {
                clearTimeout(timer)
                this.pending.delete(id)
                this.onError(err)
                resolve('deny')
              })
          }),
      },
    )
    await this.sendReply(chatId, reply)
  }

  private async onCallback(cq: TgUpdate['callback_query']): Promise<void> {
    if (!cq) return
    const outcome = handleApprovalCallback({
      callbackData: cq.data,
      fromUserId: cq.from.id,
      allowedUserIds: this.allowedUserIds,
      pendingApprovals: this.pending,
    })
    const ack: Record<string, string> = {
      resolved: cq.data?.split(':')[1] === 'deny' ? 'Denied' : 'Approved',
      unauthorized: 'Not authorized',
      'unknown-approval': 'This request expired',
      malformed: '',
    }
    await this.client.answerCallbackQuery(cq.id, ack[outcome.kind] || undefined).catch(() => {})
  }

  private async sendReply(chatId: string, text: string): Promise<void> {
    for (const chunk of splitMessage(text)) {
      await this.client.sendMessage(chatId, chunk).catch(err => this.onError(err))
    }
  }
}
