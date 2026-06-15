import { expect, test } from 'bun:test'
import { InProcessBus } from './bus'
import type { A2AEnvelope } from './envelope'

const env = (to: string): A2AEnvelope => ({ from: 'a', to, kind: 'request', task: 'x' })

test('send delivers to the addressed subscriber', async () => {
  const bus = new InProcessBus()
  const received: A2AEnvelope[] = []
  bus.subscribe('b', e => {
    received.push(e)
  })
  await bus.send(env('b'))
  expect(received).toHaveLength(1)
})

test('send to an address with no subscriber is a no-op', async () => {
  const bus = new InProcessBus()
  await expect(bus.send(env('nobody'))).resolves.toBeUndefined()
})

test('unsubscribe stops delivery', async () => {
  const bus = new InProcessBus()
  let count = 0
  const off = bus.subscribe('b', () => {
    count++
  })
  await bus.send(env('b'))
  off()
  await bus.send(env('b'))
  expect(count).toBe(1)
})
