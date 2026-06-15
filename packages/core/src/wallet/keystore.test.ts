import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  decryptHexKey,
  decryptKey,
  encryptHexKey,
  encryptKey,
  loadKeystore,
  saveKeystore,
} from './keystore'

const KEY = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])

test('encrypt → decrypt round-trips', () => {
  const ks = encryptKey(KEY, 'correct horse battery staple')
  expect(decryptKey(ks, 'correct horse battery staple')).toEqual(KEY)
})

test('wrong passphrase is rejected', () => {
  const ks = encryptKey(KEY, 'right')
  expect(() => decryptKey(ks, 'wrong')).toThrow()
})

test('hex key round-trips', () => {
  const hex = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const
  const ks = encryptHexKey(hex, 'pw')
  expect(decryptHexKey(ks, 'pw')).toBe(hex)
})

test('save → load keystore from disk', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'compass-ks-'))
  const path = join(dir, 'keystore.json')
  const ks = encryptHexKey(
    '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    'pw',
  )
  await saveKeystore(path, ks)
  const loaded = await loadKeystore(path)
  expect(decryptHexKey(loaded, 'pw')).toBe(
    '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
  )
})

test('two encryptions of the same key differ (random salt/iv)', () => {
  const a = encryptKey(KEY, 'pw')
  const b = encryptKey(KEY, 'pw')
  expect(a.blob).not.toBe(b.blob)
})
