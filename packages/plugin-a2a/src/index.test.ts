import { expect, test } from 'bun:test'
import { PACKAGE } from './index'

test('@compass_agents/plugin-a2a package identity', () => {
  expect(PACKAGE).toBe('@compass_agents/plugin-a2a')
})
