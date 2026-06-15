import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Who is allowed to drive the agent, per surface. An external surface (Telegram)
 * must be paired before its messages reach the brain — the safety floor for
 * "reach my agent from anywhere". Unknown senders get a one-time code; the
 * operator approves out-of-band (`compass pairing approve <surface> <code>`).
 */

export interface PendingPairing {
  surface: string
  id: string
  code: string
  /** Unix seconds; 0 = no expiry. */
  expiresAt: number
}

interface PairingState {
  /** `${surface}:${id}` → true for approved senders. */
  approved: Record<string, true>
  pending: PendingPairing[]
}

const key = (surface: string, id: string) => `${surface}:${id}`

export interface PairingStoreOpts {
  /** Persist to this JSON file. Omit for an in-memory store (tests). */
  path?: string
  /** Code generator (injectable for tests). Default: 6-hex-char random. */
  genCode?: () => string
  /** Clock in unix seconds (injectable for tests). Default: Date.now()/1000. */
  now?: () => number
  /** Pre-approved senders, e.g. from config allowlist. */
  seedApproved?: Array<{ surface: string; id: string }>
}

function defaultCode(): string {
  // 3 bytes → 6 hex chars; runtime-only (not a render/workflow script).
  const bytes = new Uint8Array(3)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export class PairingStore {
  private readonly path: string | undefined
  private readonly genCode: () => string
  private readonly now: () => number
  private state: PairingState = { approved: {}, pending: [] }

  constructor(opts: PairingStoreOpts = {}) {
    this.path = opts.path
    this.genCode = opts.genCode ?? defaultCode
    this.now = opts.now ?? (() => Math.floor(Date.now() / 1000))
    if (this.path && existsSync(this.path)) {
      this.state = JSON.parse(readFileSync(this.path, 'utf8')) as PairingState
      this.mtimeMs = statSync(this.path).mtimeMs
    }
    for (const s of opts.seedApproved ?? []) this.state.approved[key(s.surface, s.id)] = true
  }

  /** Last-seen mtime of the backing file (for live reload). */
  private mtimeMs = 0

  /**
   * Reload state if the file changed underneath us — so an approval made by a
   * separate process (e.g. `compass pairing approve` over SSH on a host) takes
   * effect in a long-running gateway without a restart.
   */
  private reloadIfChanged(): void {
    if (!this.path) return
    try {
      const m = statSync(this.path).mtimeMs
      if (m !== this.mtimeMs) {
        this.state = JSON.parse(readFileSync(this.path, 'utf8')) as PairingState
        this.mtimeMs = m
      }
    } catch {
      /* file not yet written */
    }
  }

  private persist(): void {
    if (!this.path) return
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, `${JSON.stringify(this.state, null, 2)}\n`)
    try {
      this.mtimeMs = statSync(this.path).mtimeMs
    } catch {}
  }

  isPaired(surface: string, id: string): boolean {
    this.reloadIfChanged()
    return this.state.approved[key(surface, id)] === true
  }

  /**
   * Issue (or reuse) a pairing code for an unknown sender. Idempotent per
   * (surface, id) while the code is unexpired.
   */
  requestCode(surface: string, id: string, ttlSeconds = 3600): string {
    this.prune()
    const existing = this.state.pending.find(p => p.surface === surface && p.id === id)
    if (existing) return existing.code
    const code = this.genCode()
    this.state.pending.push({
      surface,
      id,
      code,
      expiresAt: ttlSeconds > 0 ? this.now() + ttlSeconds : 0,
    })
    this.persist()
    return code
  }

  /** Approve a pending code → mark its sender paired. Returns the id, or null. */
  approve(surface: string, code: string): string | null {
    this.prune()
    const idx = this.state.pending.findIndex(p => p.surface === surface && p.code === code)
    if (idx === -1) return null
    const pending = this.state.pending[idx]
    if (!pending) return null
    this.state.pending.splice(idx, 1)
    this.state.approved[key(surface, pending.id)] = true
    this.persist()
    return pending.id
  }

  /** Approve a sender id directly (operator knows the id). */
  approveId(surface: string, id: string): void {
    this.state.approved[key(surface, id)] = true
    this.state.pending = this.state.pending.filter(p => !(p.surface === surface && p.id === id))
    this.persist()
  }

  revoke(surface: string, id: string): boolean {
    const k = key(surface, id)
    const had = this.state.approved[k] === true
    delete this.state.approved[k]
    this.state.pending = this.state.pending.filter(p => !(p.surface === surface && p.id === id))
    this.persist()
    return had
  }

  list(surface?: string): Array<{ surface: string; id: string }> {
    return Object.keys(this.state.approved)
      .map(k => {
        const i = k.indexOf(':')
        return { surface: k.slice(0, i), id: k.slice(i + 1) }
      })
      .filter(r => !surface || r.surface === surface)
  }

  private prune(): void {
    const t = this.now()
    const before = this.state.pending.length
    this.state.pending = this.state.pending.filter(p => p.expiresAt === 0 || p.expiresAt > t)
    if (this.state.pending.length !== before) this.persist()
  }
}
