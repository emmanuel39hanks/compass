import { expect, test } from 'bun:test'
import { operatorAccount } from './account'

test('operatorAccount derives the expected address (deterministic)', () => {
  // Well-known test key (anvil account #1).
  const a = operatorAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
  expect(a.address).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')
})
