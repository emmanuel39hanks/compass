import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { type EncryptedKeystore, decryptKey, encryptKey } from '../wallet/keystore'

/**
 * Portable, encrypted memory export. Bundle a memory directory into a single
 * JSON map, encrypt it (AES-256-GCM + scrypt, same primitives as the keystore),
 * and emit a blob a new owner can import on another machine — portable agent
 * memory, local-first, no mandatory on-chain storage.
 */

export interface MemoryBundle {
  version: 1
  /** relativePath → file contents. */
  files: Record<string, string>
}

export interface EncryptedMemoryExport {
  kind: 'compass-memory-export'
  version: 1
  keystore: EncryptedKeystore
}

async function walk(dir: string, base: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const full = join(dir, name)
    const info = await stat(full)
    if (info.isDirectory()) {
      Object.assign(out, await walk(full, base))
    } else {
      const rel = relative(base, full).split(sep).join('/')
      out[rel] = await readFile(full, 'utf8')
    }
  }
  return out
}

/** Bundle a memory dir into an unencrypted {@link MemoryBundle} (testable). */
export async function bundleMemory(dir: string): Promise<MemoryBundle> {
  return { version: 1, files: await walk(dir, dir) }
}

/** Write a bundle's files under `dir` (creating subdirs). */
export async function restoreBundle(bundle: MemoryBundle, dir: string): Promise<number> {
  let n = 0
  for (const [rel, content] of Object.entries(bundle.files)) {
    const p = join(dir, rel)
    await mkdir(dirname(p), { recursive: true })
    await writeFile(p, content, 'utf8')
    n++
  }
  return n
}

/** Encrypt a memory dir to a passphrase-protected export blob. */
export async function exportMemory(
  dir: string,
  passphrase: string,
): Promise<EncryptedMemoryExport> {
  const bundle = await bundleMemory(dir)
  const bytes = new TextEncoder().encode(JSON.stringify(bundle))
  return { kind: 'compass-memory-export', version: 1, keystore: encryptKey(bytes, passphrase) }
}

/** Decrypt an export blob and restore its files under `dir`. Returns file count. */
export async function importMemory(
  exported: EncryptedMemoryExport,
  passphrase: string,
  dir: string,
): Promise<number> {
  if (exported.kind !== 'compass-memory-export') throw new Error('not a compass memory export')
  const bytes = decryptKey(exported.keystore, passphrase)
  const bundle = JSON.parse(new TextDecoder().decode(bytes)) as MemoryBundle
  return restoreBundle(bundle, dir)
}
