import { expect, test } from 'bun:test'
import { PACKAGE } from './index'

test('@compass_agents/x402 package identity', () => {
  expect(PACKAGE).toBe('@compass_agents/x402')
})
