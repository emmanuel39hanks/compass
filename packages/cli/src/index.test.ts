import { expect, test } from 'bun:test'
import { PACKAGE } from './index'

test('@compass_agents/cli package identity', () => {
  expect(PACKAGE).toBe('@compass_agents/cli')
})
