import { expect, test } from 'bun:test'
import { PeerRegistry } from './peers'

const ADDR = '0x2222222222222222222222222222222222222222' as const

test('add, get, has, list', () => {
  const r = new PeerRegistry()
  r.add({ name: 'worker', address: ADDR })
  expect(r.has('worker')).toBe(true)
  expect(r.get('worker')?.address).toBe(ADDR)
  expect(r.list()).toHaveLength(1)
})

test('resolve throws for an unknown peer', () => {
  const r = new PeerRegistry()
  expect(() => r.resolve('ghost')).toThrow(/unknown peer/)
})
