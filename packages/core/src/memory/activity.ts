import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type ActivityKind = 'tool' | 'action' | 'message' | 'note'

export interface ActivityEntry {
  ts: string
  kind: ActivityKind
  summary: string
  meta?: Record<string, unknown>
}

/**
 * Append-only activity log — every tool call and on-chain action, one JSONL line
 * each. The audit trail behind `compass logs`. Cheap to append, easy to tail.
 */
export class ActivityLog {
  private readonly path: string
  private readonly clock: () => string

  constructor(path: string, clock: () => string = () => new Date().toISOString()) {
    this.path = path
    this.clock = clock
  }

  async append(entry: {
    kind: ActivityKind
    summary: string
    meta?: Record<string, unknown>
    ts?: string
  }): Promise<void> {
    const e: ActivityEntry = {
      ts: entry.ts ?? this.clock(),
      kind: entry.kind,
      summary: entry.summary,
      ...(entry.meta ? { meta: entry.meta } : {}),
    }
    await mkdir(dirname(this.path), { recursive: true })
    await appendFile(this.path, `${JSON.stringify(e)}\n`, 'utf8')
  }

  /** The last `n` entries (oldest→newest). */
  async tail(n = 20): Promise<ActivityEntry[]> {
    let raw: string
    try {
      raw = await readFile(this.path, 'utf8')
    } catch {
      return []
    }
    return raw
      .split('\n')
      .filter(Boolean)
      .slice(-n)
      .map(l => JSON.parse(l) as ActivityEntry)
  }
}
