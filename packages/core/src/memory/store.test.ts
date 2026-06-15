import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MemoryStore } from './store'

async function tmpStore(): Promise<MemoryStore> {
  const dir = await mkdtemp(join(tmpdir(), 'compass-mem-'))
  return new MemoryStore(dir)
}

test('save and read round-trip', async () => {
  const m = await tmpStore()
  await m.save('agent', 'note', 'hello')
  expect(await m.read('agent', 'note')).toBe('hello')
})

test('missing key returns null', async () => {
  const m = await tmpStore()
  expect(await m.read('agent', 'missing')).toBeNull()
})

test('list keys in a namespace', async () => {
  const m = await tmpStore()
  await m.save('agent', 'a', '1')
  await m.save('agent', 'b', '2')
  expect((await m.list('agent')).sort()).toEqual(['a', 'b'])
})

test('namespaces are isolated', async () => {
  const m = await tmpStore()
  await m.save('agent', 'x', 'A')
  await m.save('user', 'x', 'U')
  expect(await m.read('agent', 'x')).toBe('A')
  expect(await m.read('user', 'x')).toBe('U')
})
