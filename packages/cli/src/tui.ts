import { type BrainMessage, runTurn } from '@compass_agents/core'
import {
  BoxRenderable,
  type CliRenderer,
  InputRenderable,
  InputRenderableEvents,
  type KeyEvent,
  ScrollBoxRenderable,
  StyledText,
  type TextChunk,
  TextRenderable,
  createCliRenderer,
  fg as ofg,
  link as olink,
} from '@opentui/core'
import type { ChatSession } from './chat'
import { type SlashInfo, handleSlash, slashCommands } from './slash'

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const TURN_TIMEOUT_MS = 120_000

const C = {
  dim: '#6f6a5c',
  brand: '#8fd6c0',
  you: '#ece9e0',
  agent: '#dceace',
  tool: '#8a8578',
  ok: '#5bd178',
  warn: '#e8c468',
  err: '#e06c75',
  sel: '#f2efe6',
}

/** Live context shown in the header so you always know which chain you're on. */
export interface TuiMeta {
  network?: string
  account?: string
  budget?: string
}

function summarize(args: unknown): string {
  try {
    const s = JSON.stringify(args)
    if (!s || s === '{}') return ''
    return s.length > 72 ? `${s.slice(0, 69)}…` : s
  } catch {
    return ''
  }
}

const URL_RE = /(?:https?|file):\/\/[^\s)]+/g

/** Render a line as styled text with clickable (OSC-8) hyperlinks for any URL. */
function linkify(content: string, base: string): StyledText {
  const chunks: TextChunk[] = []
  let last = 0
  for (const m of content.matchAll(URL_RE)) {
    const i = m.index ?? 0
    if (i > last) chunks.push(ofg(base)(content.slice(last, i)))
    chunks.push(olink(m[0])(ofg('#5aa9ff')(m[0])))
    last = i + m[0].length
  }
  if (last < content.length) chunks.push(ofg(base)(content.slice(last)))
  return new StyledText(chunks.length ? chunks : [ofg(base)(content)])
}

/**
 * OpenTUI chat surface: a branded header with live chain status, a scrollable
 * transcript, a command palette that filters as you type `/`, and a focused input.
 * Drives the same session/runTurn as the readline REPL. If the native renderer
 * can't start (no TTY, missing binary), {@link runTui} throws and the caller falls
 * back to the plain REPL — so `compass` always works.
 */
export async function runTui(session: ChatSession, meta: TuiMeta = {}): Promise<void> {
  const renderer = await createCliRenderer({ exitOnCtrlC: false })
  try {
    await drive(renderer, session, meta)
  } finally {
    try {
      renderer.destroy()
    } catch {
      /* terminal already restored */
    }
  }
}

function drive(renderer: CliRenderer, session: ChatSession, meta: TuiMeta): Promise<void> {
  let resolveExit: () => void = () => {}
  const exited = new Promise<void>(r => {
    resolveExit = r
  })

  const screen = new BoxRenderable(renderer, {
    id: 'screen',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
  })
  renderer.root.add(screen)

  // ── Header: brand + live chain status ──────────────────────────────────────
  const status = [meta.network, meta.account ? short(meta.account) : '', meta.budget]
    .filter(Boolean)
    .join('  ·  ')
  const header = new BoxRenderable(renderer, {
    id: 'header',
    border: true,
    borderStyle: 'rounded',
    borderColor: C.dim,
    title: ' compass ',
    titleColor: C.brand,
    paddingLeft: 1,
    paddingRight: 1,
  })
  header.add(
    new TextRenderable(renderer, {
      id: 'headerText',
      content: `your personal on-chain agent${status ? `      ${status}` : ''}`,
      fg: C.dim,
    }),
  )
  screen.add(header)

  // ── Transcript ──────────────────────────────────────────────────────────────
  const log = new ScrollBoxRenderable(renderer, {
    id: 'log',
    flexGrow: 1,
    scrollY: true,
    stickyScroll: true,
    stickyStart: 'bottom',
    paddingLeft: 1,
    paddingTop: 1,
  })
  screen.add(log)

  // ── Command palette (filters as you type `/`) + spinner/approval line ────────
  const palette = new TextRenderable(renderer, { id: 'palette', content: '', fg: C.dim })
  screen.add(palette)
  const statusLine = new TextRenderable(renderer, { id: 'status', content: '', fg: C.dim })
  screen.add(statusLine)

  const input = new InputRenderable(renderer, {
    id: 'input',
    placeholder: 'ask anything, or type / for commands',
  })
  screen.add(input)
  input.focus()

  screen.add(
    new TextRenderable(renderer, {
      id: 'footer',
      content: '↵ send    /  commands    ↑↓ pick · Tab complete    ⌘-click links    ^C quit',
      fg: C.dim,
    }),
  )

  let lineId = 0
  const append = (content: string, fg?: string) => {
    // URLs/file paths become clickable (OSC-8) hyperlinks; everything else is plain.
    const node = content.includes('://')
      ? new TextRenderable(renderer, {
          id: `l${lineId++}`,
          content: linkify(content, fg ?? C.agent),
        })
      : new TextRenderable(renderer, { id: `l${lineId++}`, content, ...(fg ? { fg } : {}) })
    log.add(node)
    log.scrollTo(log.scrollHeight)
  }

  // Welcome — say what compass is and how to drive it (so it's never a blank void).
  append('Your personal on-chain agent — it acts within strict, revocable limits.', C.agent)
  append('')
  append('  send USDC · hire agents · pay & discover data (x402) · check reputation', C.dim)
  append('  generate & analyze media · search the web · use connected MCP tools', C.dim)
  append('')
  append('Type  /  for commands, or just ask (e.g. "what\'s my balance?").', C.dim)
  append(
    'From your shell:  compass card  → publish an AgentCard   ·   compass-mcp  → MCP server',
    C.dim,
  )
  append('')

  // ── Spinner ───────────────────────────────────────────────────────────────
  let spinTimer: ReturnType<typeof setInterval> | null = null
  let frame = 0
  let label = ''
  const spin = {
    start(text: string) {
      label = text
      if (spinTimer) return
      spinTimer = setInterval(() => {
        frame = (frame + 1) % SPINNER.length
        statusLine.content = `${SPINNER[frame]} ${label}`
      }, 90)
    },
    set(text: string) {
      label = text
    },
    stop() {
      if (spinTimer) {
        clearInterval(spinTimer)
        spinTimer = null
      }
      statusLine.content = ''
    },
  }

  const quit = () => {
    spin.stop()
    resolveExit()
  }

  // ── Command palette state ────────────────────────────────────────────────────
  const commands = slashCommands(session)
  let matches: SlashInfo[] = []
  let sel = 0
  const renderPalette = () => {
    palette.content = matches
      .map((c, i) => `${i === sel ? ' ❯ ' : '   '}${c.usage.padEnd(30)} ${c.desc}`)
      .join('\n')
  }
  const clearPalette = () => {
    matches = []
    sel = 0
    palette.content = ''
  }
  const updatePalette = (value: string) => {
    const v = value.replace(/^\s+/, '')
    // Only while typing the command name (before any space/args).
    if (!v.startsWith('/') || /\s/.test(v)) return clearPalette()
    const partial = v.slice(1).toLowerCase()
    matches = commands.filter(c => c.name.startsWith(partial))
    if (matches.length === 0) {
      palette.content = `   no command matches /${partial}`
      return
    }
    if (sel >= matches.length) sel = 0
    renderPalette()
  }
  input.on(InputRenderableEvents.INPUT, (value: string) => updatePalette(value))

  // ── Approval bridge: a dangerous tool pauses the turn; the next line answers ──
  let pending: { tool: string; resolve: (ok: boolean) => void } | null = null
  session.gate.setPrompter(
    (call, tool) =>
      new Promise<boolean>(resolve => {
        spin.stop()
        const s = summarize(call.args)
        statusLine.content = `⚠ approve ${tool.name}${s ? ` ${s}` : ''}  —  y / n / a(lways)`
        pending = { tool: tool.name, resolve }
      }),
  )

  let busy = false
  let history: BrainMessage[] = []

  const runChatTurn = (text: string) => {
    append(`you › ${text}`, C.you)
    busy = true
    spin.start('thinking…')
    void (async () => {
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
            onToolStart: name => {
              append(`· ${name}`, C.tool)
              spin.set(`running ${name}…`)
            },
          },
        )
        history = res.history
        spin.stop()
        append(res.content, C.agent)
        append('')
      } catch (err) {
        spin.stop()
        const msg = (err as Error).message
        append(
          `✗ ${/abort|timeout/i.test(msg) ? 'took too long and was stopped — try again' : msg}`,
          C.err,
        )
      } finally {
        busy = false
      }
    })()
  }

  const runSlash = (text: string) => {
    append(`you › ${text}`, C.you)
    busy = true
    spin.start('working…')
    void (async () => {
      try {
        const sr = await handleSlash(session, text)
        spin.stop()
        if (sr.exit) return quit()
        if (sr.output) {
          append(sr.output, C.agent)
          append('')
        }
      } catch (err) {
        spin.stop()
        append(`✗ ${(err as Error).message}`, C.err)
      } finally {
        busy = false
      }
    })()
  }

  input.on(InputRenderableEvents.ENTER, (value: string) => {
    const text = value.trim()
    input.value = ''
    clearPalette()

    if (pending) {
      const a = text.toLowerCase()
      const p = pending
      pending = null
      const ok = a === 'a' || a === 'always' || a === 'y' || a === 'yes'
      if (a === 'a' || a === 'always') session.gate.allowForSession(p.tool)
      statusLine.content = ''
      append(`approve ${p.tool} → ${ok ? 'yes' : 'no'}`, ok ? C.ok : C.dim)
      if (ok) spin.start(`executing ${p.tool}…`)
      p.resolve(ok)
      return
    }

    if (!text || busy) return
    if (text.startsWith('/')) runSlash(text)
    else runChatTurn(text)
  })

  // ── Keys: Ctrl-C quits; ↑↓/Tab drive the palette while it's open ─────────────
  renderer.keyInput.on('keypress', (key: KeyEvent) => {
    if (key.ctrl && key.name === 'c') return quit()
    if (matches.length === 0) return
    if (key.name === 'up') {
      sel = (sel - 1 + matches.length) % matches.length
      renderPalette()
    } else if (key.name === 'down') {
      sel = (sel + 1) % matches.length
      renderPalette()
    } else if (key.name === 'tab') {
      input.value = `/${matches[sel]!.name} `
      clearPalette()
    } else if (key.name === 'escape') {
      clearPalette()
    }
  })

  return exited
}

function short(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}
