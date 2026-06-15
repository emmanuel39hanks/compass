import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportMemory, importMemory } from './export'
import { MemoryStore } from './store'

async function dir(prefix: string) {
  return mkdtemp(join(tmpdir(), prefix))
}

test('encrypted export → import round-trips memory to another dir', async () => {
  const src = await dir('compass-mem-src-')
  const store = new MemoryStore(src)
  await store.save('user', 'pref', 'likes Base Sepolia')
  await store.save('agent', 'name', 'scout')

  const exported = await exportMemory(src, 'hunter2')
  expect(exported.kind).toBe('compass-memory-export')

  const dst = await dir('compass-mem-dst-')
  const count = await importMemory(exported, 'hunter2', dst)
  expect(count).toBe(2)

  const restored = new MemoryStore(dst)
  expect(await restored.read('user', 'pref')).toBe('likes Base Sepolia')
  expect(await restored.read('agent', 'name')).toBe('scout')
})

test('a wrong passphrase fails to import', async () => {
  const src = await dir('compass-mem-src-')
  await new MemoryStore(src).save('user', 'pref', 'secret-ish')
  const exported = await exportMemory(src, 'right')
  await expect(importMemory(exported, 'wrong', await dir('compass-mem-dst-'))).rejects.toThrow()
})

test('the export blob does not contain the plaintext', async () => {
  const src = await dir('compass-mem-src-')
  await new MemoryStore(src).save('user', 'pref', 'TOPSECRETVALUE')
  const exported = await exportMemory(src, 'pw')
  expect(JSON.stringify(exported).includes('TOPSECRETVALUE')).toBe(false)
})
