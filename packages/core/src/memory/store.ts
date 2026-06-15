import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Sanitize a namespace/key segment into a safe filename component. */
function safe(seg: string): string {
  return seg.replace(/[^a-zA-Z0-9._-]/g, '_')
}

/**
 * Local filesystem memory. The chain holds authority; memory stays local. Keys
 * are partitioned by namespace (e.g. `agent`, `user`, channel ids).
 */
export class MemoryStore {
  constructor(private readonly root: string) {}

  private path(namespace: string, key: string): string {
    return join(this.root, safe(namespace), `${safe(key)}.txt`)
  }

  async save(namespace: string, key: string, value: string): Promise<void> {
    const p = this.path(namespace, key)
    await mkdir(dirname(p), { recursive: true })
    await writeFile(p, value, 'utf8')
  }

  async read(namespace: string, key: string): Promise<string | null> {
    try {
      return await readFile(this.path(namespace, key), 'utf8')
    } catch {
      return null
    }
  }

  async list(namespace: string): Promise<string[]> {
    try {
      const files = await readdir(join(this.root, safe(namespace)))
      return files.filter(f => f.endsWith('.txt')).map(f => f.slice(0, -4))
    } catch {
      return []
    }
  }
}
