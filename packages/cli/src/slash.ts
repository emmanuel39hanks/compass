import type { ChatSession } from './chat'

/**
 * Slash commands — shortcuts that dispatch a capability tool directly (still
 * through the approval gate, so dangerous actions still ask). Shared by the
 * readline REPL and the OpenTUI chat. Plain English still works; these are just
 * a faster, deterministic way to reach a specific capability.
 */

export interface SlashResult {
  handled: boolean
  output?: string
  exit?: boolean
}

interface SlashSpec {
  tool: string
  usage: string
  desc: string
  /** Parse the text after the command into tool args, or return a usage string on error. */
  parse: (rest: string) => Record<string, unknown> | string
}

const two = (rest: string, usage: string) => {
  const m = rest.match(/^(\S+)\s+(\S+)\s*([\s\S]*)$/)
  return m ? { a: m[1], b: m[2], c: m[3]?.trim() ?? '' } : usage
}

export const SLASH: Record<string, SlashSpec> = {
  balance: {
    tool: 'chain.balance',
    usage: '/balance',
    desc: 'your USDC balance + network',
    parse: () => ({}),
  },
  send: {
    tool: 'chain.send',
    usage: '/send <amount> <address>',
    desc: 'send USDC (asks approval)',
    parse: r => {
      const p = two(r, 'usage: /send <amount> <address>')
      return typeof p === 'string' ? p : { amount: p.a, to: p.b }
    },
  },
  discover: {
    tool: 'discover',
    usage: '/discover [query]',
    desc: 'find payable x402 services',
    parse: r => (r.trim() ? { query: r.trim() } : {}),
  },
  pay: {
    tool: 'pay',
    usage: '/pay <url>',
    desc: 'buy an x402 resource (asks approval)',
    parse: r => (r.trim() ? { url: r.trim() } : 'usage: /pay <url>'),
  },
  hire: {
    tool: 'a2a.hire',
    usage: '/hire <amount> <address> [task]',
    desc: 'hire a helper agent (asks approval)',
    parse: r => {
      const p = two(r, 'usage: /hire <amount> <address> [task]')
      return typeof p === 'string' ? p : { amount: p.a, to: p.b, ...(p.c ? { task: p.c } : {}) }
    },
  },
  reputation: {
    tool: 'a2a.reputation',
    usage: '/reputation <agent>',
    desc: 'check a peer’s on-chain reputation',
    parse: r => (r.trim() ? { agent: r.trim() } : 'usage: /reputation <agent>'),
  },
  image: {
    tool: 'venice.image',
    usage: '/image <prompt>',
    desc: 'generate an image',
    parse: r => (r.trim() ? { prompt: r.trim() } : 'usage: /image <prompt>'),
  },
  vision: {
    tool: 'venice.vision',
    usage: '/vision <url> [question]',
    desc: 'analyze an image',
    parse: r => {
      const m = r.match(/^(\S+)\s*([\s\S]*)$/)
      if (!m) return 'usage: /vision <url> [question]'
      return { imageUrl: m[1], ...(m[2]?.trim() ? { prompt: m[2].trim() } : {}) }
    },
  },
  say: {
    tool: 'venice.speak',
    usage: '/say <text>',
    desc: 'text-to-speech',
    parse: r => (r.trim() ? { text: r.trim() } : 'usage: /say <text>'),
  },
  search: {
    tool: 'web.search',
    usage: '/search <query>',
    desc: 'search the web',
    parse: r => (r.trim() ? { query: r.trim() } : 'usage: /search <query>'),
  },
}

export interface SlashInfo {
  name: string
  usage: string
  desc: string
}

/** The commands this session can actually run (its registered tools), for menus. */
export function slashCommands(session: ChatSession): SlashInfo[] {
  return Object.entries(SLASH)
    .filter(([, s]) => session.tools.has(s.tool))
    .map(([name, s]) => ({ name, usage: s.usage, desc: s.desc }))
}

/** A help listing of the available commands (marks ones the session can't run). */
export function slashHelp(session: ChatSession): string {
  const rows = [
    ['/help', 'this list'],
    ['/exit', 'quit'],
  ]
  for (const spec of Object.values(SLASH)) {
    const ok = session.tools.has(spec.tool)
    rows.push([spec.usage, ok ? spec.desc : `${spec.desc}  (unavailable)`])
  }
  const w = Math.max(...rows.map(r => r[0]!.length))
  return [
    'Type plain English, or use a shortcut:',
    ...rows.map(r => `  ${r[0]!.padEnd(w)}  ${r[1]}`),
  ].join('\n')
}

/** Handle a line as a slash command. Returns {handled:false} for normal chat input. */
export async function handleSlash(session: ChatSession, line: string): Promise<SlashResult> {
  const trimmed = line.trim()
  if (!trimmed.startsWith('/')) return { handled: false }
  const m = trimmed.slice(1).match(/^(\S*)\s*([\s\S]*)$/)
  const cmd = (m?.[1] ?? '').toLowerCase()
  const rest = m?.[2] ?? ''
  if (cmd === 'exit' || cmd === 'quit') return { handled: true, exit: true }
  if (cmd === '' || cmd === 'help' || cmd === '?')
    return { handled: true, output: slashHelp(session) }
  const spec = SLASH[cmd]
  if (!spec) return { handled: true, output: `unknown command /${cmd} — try /help` }
  if (!session.tools.has(spec.tool)) {
    return { handled: true, output: `/${cmd} isn't available here (needs ${spec.tool})` }
  }
  const args = spec.parse(rest)
  if (typeof args === 'string') return { handled: true, output: args }
  const msg = await session.tools.dispatch(
    { id: 'slash', name: spec.tool, args },
    session.ctx,
    session.gate,
  )
  return { handled: true, output: msg.content }
}
