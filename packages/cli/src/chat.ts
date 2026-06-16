import { createInterface } from 'node:readline/promises'
import {
  ApprovalGate,
  type ApprovalMode,
  type Brain,
  type BrainMessage,
  type MemoryStore,
  type RunTurnResult,
  type ToolContext,
  type ToolDef,
  ToolRegistry,
  runTurn,
  scanForThreats,
} from '@compass_agents/core'
import { z } from 'zod'

export const COMPASS_SYSTEM =
  "You are compass — the user's personal on-chain agent. You act on their behalf " +
  'within strict, revocable spending limits they set. Be concise and plain-spoken; ' +
  'avoid jargon. Use tools when they help; never claim to have done something you ' +
  "didn't. If a task would exceed the user's limits, say so plainly."

const DEFAULT_SYSTEM = COMPASS_SYSTEM

/** Built-in memory tools so the agent can remember/recall across the session. */
export function makeMemoryTools(): ToolDef[] {
  const save: ToolDef<{ key: string; value: string }> = {
    name: 'memory.save',
    description: 'Remember a fact for later (key + value).',
    schema: z.object({ key: z.string().min(1), value: z.string() }),
    run: async (args, ctx: ToolContext) => {
      // A memory file is injected into the brain's prompt later — never persist
      // prompt-injection or credential leaks.
      const scan = scanForThreats(args.value)
      if (!scan.ok) {
        return { content: `refused to save: ${scan.violations[0]?.reason}`, ok: false }
      }
      await ctx.memory.save('agent', args.key, args.value)
      return { content: `remembered "${args.key}"`, ok: true }
    },
  }
  const read: ToolDef<{ key: string }> = {
    name: 'memory.read',
    description: 'Recall a previously saved fact by key.',
    schema: z.object({ key: z.string().min(1) }),
    run: async (args, ctx: ToolContext) => {
      const v = await ctx.memory.read('agent', args.key)
      return { content: v ?? '(nothing saved under that key)', ok: true }
    },
  }
  return [save, read]
}

export interface SessionOpts {
  brain: Brain
  memory: MemoryStore
  system?: string
  approvalsMode?: ApprovalMode
  extraTools?: ToolDef[]
}

export interface ChatSession {
  brain: Brain
  tools: ToolRegistry
  gate: ApprovalGate
  ctx: ToolContext
  system: string
}

/** Assemble a chat session (brain + tools + approval gate + memory context). */
export function createSession(opts: SessionOpts): ChatSession {
  const tools = new ToolRegistry()
  for (const tool of makeMemoryTools()) tools.register(tool)
  for (const tool of opts.extraTools ?? []) tools.register(tool)
  return {
    brain: opts.brain,
    tools,
    gate: new ApprovalGate({ mode: opts.approvalsMode ?? 'prompt' }),
    ctx: { memory: opts.memory },
    system: opts.system ?? DEFAULT_SYSTEM,
  }
}

/** Run one chat turn against the session, threading history. */
export function chatTurn(
  session: ChatSession,
  history: BrainMessage[],
  text: string,
): Promise<RunTurnResult> {
  return runTurn(
    { kind: 'chat', text },
    {
      brain: session.brain,
      tools: session.tools,
      gate: session.gate,
      ctx: session.ctx,
      system: session.system,
      history,
      onToolStart: name => process.stdout.write(`  · ${name}\n`),
    },
  )
}

/** A short, readable preview of a tool call's args for the approval prompt. */
function summarizeCall(args: unknown): string {
  try {
    const s = JSON.stringify(args)
    if (!s || s === '{}') return ''
    return s.length > 80 ? `${s.slice(0, 77)}…` : s
  } catch {
    return ''
  }
}

/** A minimal, dependency-free terminal spinner so the chat never looks frozen. */
function makeSpinner() {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  let timer: ReturnType<typeof setInterval> | null = null
  let i = 0
  let label = ''
  const draw = () => {
    i = (i + 1) % frames.length
    process.stdout.write(`\r\x1b[K\x1b[2m${frames[i]} ${label}\x1b[0m`)
  }
  return {
    start(text: string) {
      label = text
      if (timer) return
      process.stdout.write('\x1b[?25l') // hide cursor
      draw()
      timer = setInterval(draw, 90)
    },
    set(text: string) {
      label = text
    },
    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      process.stdout.write('\r\x1b[K\x1b[?25h') // clear line + show cursor
    },
  }
}

/** A single turn may run this long before we abort it, so a stuck call never hangs. */
const TURN_TIMEOUT_MS = 120_000

/** Interactive readline REPL — the `compass` chat, with live "thinking…" feedback. */
export async function startRepl(session: ChatSession): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const spin = makeSpinner()

  // Authorize dangerous tools (chain.send, a2a.hire, …) right here in the terminal.
  // Without a prompter the gate denies them outright ("no prompter configured").
  session.gate.setPrompter(async (call, tool) => {
    spin.stop() // clear the spinner so the prompt renders cleanly
    const summary = summarizeCall(call.args)
    const ans = (
      await rl.question(
        `  \x1b[33m⚠ approve\x1b[0m ${tool.name}${summary ? ` \x1b[2m${summary}\x1b[0m` : ''}  [y/N/a=always] `,
      )
    )
      .trim()
      .toLowerCase()
    let ok = false
    if (ans === 'a' || ans === 'always') {
      session.gate.allowForSession(tool.name)
      ok = true
    } else if (ans === 'y' || ans === 'yes') {
      ok = true
    }
    if (ok) spin.start(`executing ${tool.name}…`)
    return ok
  })

  let history: BrainMessage[] = []
  console.log('compass · chat — tell your agent a goal in plain English. /exit to quit.\n')
  for (;;) {
    let text: string
    try {
      text = (await rl.question('\x1b[1myou ›\x1b[0m ')).trim()
    } catch {
      break // stdin closed (EOF / Ctrl-D)
    }
    if (!text) continue
    if (text === '/exit' || text === '/quit') break

    spin.start('thinking…')
    try {
      const res = await runTurn(
        { kind: 'chat', text },
        {
          brain: session.brain,
          tools: session.tools,
          gate: session.gate,
          ctx: { ...session.ctx, signal: AbortSignal.timeout(TURN_TIMEOUT_MS) },
          system: session.system,
          history,
          onThink: () => spin.set('thinking…'),
          onToolStart: name => spin.set(`running ${name}…`),
        },
      )
      spin.stop()
      history = res.history
      console.log(`\n${res.content}\n`)
    } catch (err) {
      spin.stop()
      const msg = (err as Error).message
      const friendly = /abort|timeout|timed out/i.test(msg)
        ? `the agent took too long (over ${TURN_TIMEOUT_MS / 1000}s) and was stopped — try again`
        : msg
      console.error(`\x1b[31m✗\x1b[0m ${friendly}\n`)
    }
  }
  spin.stop()
  rl.close()
}
