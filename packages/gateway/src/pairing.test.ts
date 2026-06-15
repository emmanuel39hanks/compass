import { expect, test } from 'bun:test'
import { PairingStore } from './pairing'

function store(now = () => 1000) {
  let n = 0
  return new PairingStore({ genCode: () => `CODE${++n}`, now })
}

test('unknown sender is not paired until a code is approved', () => {
  const s = store()
  expect(s.isPaired('telegram', '42')).toBe(false)
  const code = s.requestCode('telegram', '42')
  expect(code).toBe('CODE1')
  expect(s.isPaired('telegram', '42')).toBe(false)
  expect(s.approve('telegram', code)).toBe('42')
  expect(s.isPaired('telegram', '42')).toBe(true)
})

test('requestCode is idempotent per sender while unexpired', () => {
  const s = store()
  expect(s.requestCode('telegram', '42')).toBe('CODE1')
  expect(s.requestCode('telegram', '42')).toBe('CODE1')
})

test('approving a bad code returns null', () => {
  const s = store()
  s.requestCode('telegram', '42')
  expect(s.approve('telegram', 'nope')).toBeNull()
})

test('approveId pairs directly and clears any pending', () => {
  const s = store()
  s.requestCode('telegram', '7')
  s.approveId('telegram', '7')
  expect(s.isPaired('telegram', '7')).toBe(true)
})

test('revoke removes an approved sender', () => {
  const s = store()
  s.approveId('telegram', '7')
  expect(s.revoke('telegram', '7')).toBe(true)
  expect(s.isPaired('telegram', '7')).toBe(false)
  expect(s.revoke('telegram', '7')).toBe(false)
})

test('list returns approved senders, filterable by surface', () => {
  const s = store()
  s.approveId('telegram', '1')
  s.approveId('a2a', 'alice')
  expect(s.list().length).toBe(2)
  expect(s.list('telegram')).toEqual([{ surface: 'telegram', id: '1' }])
})

test('expired codes are pruned and cannot be approved', () => {
  let t = 1000
  const s = new PairingStore({ genCode: () => 'C', now: () => t })
  const code = s.requestCode('telegram', '42', 100)
  t = 1101 // past expiry
  expect(s.approve('telegram', code)).toBeNull()
})

test('surface is namespaced — same id on two surfaces is independent', () => {
  const s = store()
  s.approveId('telegram', '99')
  expect(s.isPaired('telegram', '99')).toBe(true)
  expect(s.isPaired('a2a', '99')).toBe(false)
})

test('seedApproved pre-pairs an allowlist', () => {
  const s = new PairingStore({ seedApproved: [{ surface: 'telegram', id: '5' }] })
  expect(s.isPaired('telegram', '5')).toBe(true)
})
