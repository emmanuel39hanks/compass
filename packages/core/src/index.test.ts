import { expect, test } from 'bun:test'
import { PACKAGE } from './index'

test('@compass_agents/core package identity', () => {
  expect(PACKAGE).toBe('@compass_agents/core')
})
