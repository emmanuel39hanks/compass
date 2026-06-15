import {
  type ActivityLog,
  ApprovalGate,
  type ApprovalMode,
  type Brain,
  type BrainMessage,
  type MemoryStore,
  type ToolCall,
  type ToolContext,
  type ToolDef,
  type ToolRegistry,
  compactHistory,
  runTurn,
} from '@compass_agents/core'
import { type PairingStore, formatPairingMessage } from './pairing-flow'

export type ApprovalChoice = 'once' | 'session' | 'always' | 'deny'

export interface ApprovalAsk {
  surface: string
  chatId: string
  tool: string
  summary: string
}

/** Per-turn hooks a surface supplies so approvals/typing reach the right chat. */
export interface TurnHooks {
  /** Ask the operator to approve a dangerous tool; resolve with their choice. */
  approve?: (ask: ApprovalAsk) => Promise<ApprovalChoice>
  /** Fired before the brain runs (e.g. a typing indicator). */
  onStart?: () => void | Promise<void>
}

export interface InboundMessage {
  surface: string
  chatId: string
  text: string
}

export interface GatewayDeps {
  brain: Brain
  tools: ToolRegistry
  memory: MemoryStore
  system: string
  approvalsMode?: ApprovalMode
  /** When set, unknown senders are gated behind a pairing code. */
  pairing?: PairingStore
  agentName?: string
  /** Max history messages kept per chat (rolling). Default 40. */
  historyLimit?: number
  /** Append tool calls + actions to this log (the `compass logs` audit trail). */
  activity?: ActivityLog
  /** Persist per-chat history across restarts (under the `history` namespace). */
  persistHistory?: boolean
  /** Fold old turns into a summary past `threshold`, keeping `keepRecent` verbatim. */
  compaction?: { threshold?: number; keepRecent?: number }
}

interface ChatState {
  history: BrainMessage[]
  /** Tools the operator allowed for the rest of this chat. */
  sessionAllowed: Set<string>
}

/**
 * The agent as a long-lived service: one brain, many surfaces. Each surface
 * feeds {@link InboundMessage}s; the gateway threads per-chat history, enforces
 * pairing, and bridges dangerous-tool approvals back to the surface. TUI,
 * Telegram, and A2A all drive the same runtime.
 */
export class Gateway {
  private readonly deps: GatewayDeps
  private readonly chats = new Map<string, ChatState>()
  private readonly historyLimit: number

  constructor(deps: GatewayDeps) {
    this.deps = deps
    this.historyLimit = deps.historyLimit ?? 40
  }

  get pairing(): PairingStore | undefined {
    return this.deps.pairing
  }

  private chatKey(m: InboundMessage): string {
    return `${m.surface}:${m.chatId}`
  }

  private async stateFor(key: string): Promise<ChatState> {
    let s = this.chats.get(key)
    if (!s) {
      s = { history: await this.loadHistory(key), sessionAllowed: new Set() }
      this.chats.set(key, s)
    }
    return s
  }

  private async loadHistory(key: string): Promise<BrainMessage[]> {
    if (!this.deps.persistHistory) return []
    const raw = await this.deps.memory.read('history', key)
    if (!raw) return []
    try {
      return JSON.parse(raw) as BrainMessage[]
    } catch {
      return []
    }
  }

  private async saveHistory(key: string, history: BrainMessage[]): Promise<void> {
    if (!this.deps.persistHistory) return
    await this.deps.memory.save('history', key, JSON.stringify(history))
  }

  /** Summarize via the brain — the compaction summarizer. */
  private summarize = async (messages: BrainMessage[]): Promise<string> => {
    const turn = await this.deps.brain.infer({
      system: 'Summarize the conversation so far in 3-5 sentences for future context.',
      messages,
      tools: [],
    })
    return turn.content ?? ''
  }

  /** Process one inbound message and return the agent's reply text. */
  async handleMessage(msg: InboundMessage, hooks: TurnHooks = {}): Promise<string> {
    if (this.deps.pairing && !this.deps.pairing.isPaired(msg.surface, msg.chatId)) {
      const code = this.deps.pairing.requestCode(msg.surface, msg.chatId)
      return formatPairingMessage({
        code,
        surface: msg.surface,
        ...(this.deps.agentName ? { agentName: this.deps.agentName } : {}),
      })
    }

    const key = this.chatKey(msg)
    const state = await this.stateFor(key)
    const gate = this.buildGate(msg, state, hooks)

    const logs: Promise<unknown>[] = []
    const log = (
      kind: 'tool' | 'message' | 'action',
      summary: string,
      meta?: Record<string, unknown>,
    ) => {
      if (this.deps.activity) {
        logs.push(
          this.deps.activity.append({ kind, summary, ...(meta ? { meta } : {}) }).catch(() => {}),
        )
      }
    }
    log('message', truncate(msg.text), { surface: msg.surface, chatId: msg.chatId })

    await hooks.onStart?.()
    const res = await runTurn(
      { kind: 'chat', text: msg.text },
      {
        brain: this.deps.brain,
        tools: this.deps.tools,
        gate,
        ctx: { memory: this.deps.memory } as ToolContext,
        system: this.deps.system,
        history: state.history,
        onToolStart: name => log('tool', name),
      },
    )
    state.history = this.deps.compaction
      ? await compactHistory(res.history, { ...this.deps.compaction, summarize: this.summarize })
      : res.history.slice(-this.historyLimit)
    await this.saveHistory(key, state.history)
    await Promise.all(logs)
    return res.content
  }

  /** A per-chat approval gate whose prompter bridges to the surface. */
  private buildGate(msg: InboundMessage, state: ChatState, hooks: TurnHooks): ApprovalGate {
    const gate = new ApprovalGate({
      mode: this.deps.approvalsMode ?? 'prompt',
      prompter: async (call: ToolCall, tool: ToolDef) => {
        if (state.sessionAllowed.has(tool.name)) return true
        if (!hooks.approve) return false // no way to ask → deny dangerous
        const choice = await hooks.approve({
          surface: msg.surface,
          chatId: msg.chatId,
          tool: tool.name,
          summary: summarize(call),
        })
        if (choice === 'deny') return false
        if (choice === 'session' || choice === 'always') state.sessionAllowed.add(tool.name)
        return true
      },
    })
    for (const t of state.sessionAllowed) gate.allowForSession(t)
    return gate
  }
}

function summarize(call: ToolCall): string {
  try {
    const args = JSON.stringify(call.args)
    return args.length > 160 ? `${args.slice(0, 157)}…` : args
  } catch {
    return ''
  }
}

function truncate(text: string, n = 120): string {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text
}
