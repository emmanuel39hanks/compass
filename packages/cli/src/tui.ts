import { type BrainMessage, runTurn } from '@compass_agents/core'
import {
  BoxRenderable,
  type CliRenderer,
  InputRenderable,
  InputRenderableEvents,
  type KeyEvent,
  ScrollBoxRenderable,
  TextRenderable,
  createCliRenderer,
} from '@opentui/core'
import type { ChatSession } from './chat'
import { handleSlash } from './slash'

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const TURN_TIMEOUT_MS = 120_000

const C = {
  dim: '#6f6a5c',
  you: '#ece9e0',
  agent: '#dceace',
  tool: '#8a8578',
  ok: '#5bd178',
  warn: '#e8c468',
  err: '#e06c75',
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

/**
 * OpenTUI chat surface: a scrollable transcript, an animated status line, and a
 * focused input. Drives the same session/runTurn as the readline REPL. If the
 * native renderer can't start (no TTY, missing binary), {@link runTui} throws and
 * the caller falls back to the plain REPL — so `compass` always works.
 */
export async function runTui(session: ChatSession): Promise<void> {
  const renderer = await createCliRenderer({ exitOnCtrlC: false })
  try {
    await drive(renderer, session)
  } finally {
    try {
      renderer.destroy()
    } catch {
      /* terminal already restored */
    }
  }
}

function drive(renderer: CliRenderer, session: ChatSession): Promise<void> {
  let resolveExit: () => void = () => {}
  const exited = new Promise<void>(r => {
    resolveExit = r
  })

  const screen = new BoxRenderable(renderer, {
    id: 'screen',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    padding: 1,
  })
  renderer.root.add(screen)

  screen.add(
    new TextRenderable(renderer, {
      id: 'header',
      content: 'compass · chat — tell your agent a goal. /exit or Ctrl-C to quit.',
      fg: C.dim,
    }),
  )

  const log = new ScrollBoxRenderable(renderer, {
    id: 'log',
    flexGrow: 1,
    scrollY: true,
    stickyScroll: true,
    stickyStart: 'bottom',
  })
  screen.add(log)

  const status = new TextRenderable(renderer, { id: 'status', content: '', fg: C.dim })
  screen.add(status)

  const input = new InputRenderable(renderer, {
    id: 'input',
    placeholder: 'send 5 USDC to 0x… · what is my balance? …',
  })
  screen.add(input)
  input.focus()

  let lineId = 0
  const append = (content: string, fg?: string) => {
    log.add(new TextRenderable(renderer, { id: `l${lineId++}`, content, ...(fg ? { fg } : {}) }))
    log.scrollTo(log.scrollHeight)
  }

  let spinTimer: ReturnType<typeof setInterval> | null = null
  let frame = 0
  let label = ''
  const spin = {
    start(text: string) {
      label = text
      if (spinTimer) return
      spinTimer = setInterval(() => {
        frame = (frame + 1) % SPINNER.length
        status.content = `${SPINNER[frame]} ${label}`
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
      status.content = ''
    },
  }

  const quit = () => {
    spin.stop()
    resolveExit()
  }

  // Approval bridge: a dangerous tool pauses the turn; the next input line answers it.
  let pending: { tool: string; resolve: (ok: boolean) => void } | null = null
  session.gate.setPrompter(
    (call, tool) =>
      new Promise<boolean>(resolve => {
        spin.stop()
        const s = summarize(call.args)
        status.content = `⚠ approve ${tool.name}${s ? ` ${s}` : ''}  —  y / n / a(lways)`
        pending = { tool: tool.name, resolve }
      }),
  )

  let busy = false
  let history: BrainMessage[] = []

  input.on(InputRenderableEvents.ENTER, (value: string) => {
    const text = value.trim()
    input.value = ''

    if (pending) {
      const a = text.toLowerCase()
      const p = pending
      pending = null
      let ok = false
      if (a === 'a' || a === 'always') {
        session.gate.allowForSession(p.tool)
        ok = true
      } else if (a === 'y' || a === 'yes') {
        ok = true
      }
      status.content = ''
      append(`approve ${p.tool} → ${ok ? 'yes' : 'no'}`, ok ? C.ok : C.dim)
      if (ok) spin.start(`executing ${p.tool}…`)
      p.resolve(ok)
      return
    }

    if (!text || busy) return

    // Slash commands run a capability directly (still through the approval gate).
    if (text.startsWith('/')) {
      append(`you › ${text}`, C.you)
      busy = true
      spin.start('working…')
      void (async () => {
        try {
          const sr = await handleSlash(session, text)
          spin.stop()
          if (sr.exit) {
            quit()
            return
          }
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
      return
    }

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
        const friendly = /abort|timeout/i.test(msg)
          ? 'the agent took too long and was stopped — try again'
          : msg
        append(`✗ ${friendly}`, C.err)
      } finally {
        busy = false
      }
    })()
  })

  renderer.keyInput.on('keypress', (key: KeyEvent) => {
    if (key.ctrl && key.name === 'c') quit()
  })

  return exited
}
