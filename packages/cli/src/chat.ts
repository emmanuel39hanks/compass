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

/** Interactive readline REPL — the `compass` chat. */
export async function startRepl(session: ChatSession): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  let history: BrainMessage[] = []
  console.log('compass · chat — tell your agent a goal in plain English. /exit to quit.\n')
  for (;;) {
    let text: string
    try {
      text = (await rl.question('you › ')).trim()
    } catch {
      break // stdin closed (EOF / Ctrl-D)
    }
    if (!text) continue
    if (text === '/exit' || text === '/quit') break
    try {
      const res = await chatTurn(session, history, text)
      history = res.history
      console.log(`\n${res.content}\n`)
    } catch (err) {
      console.error(`error: ${(err as Error).message}\n`)
    }
  }
  rl.close()
}
