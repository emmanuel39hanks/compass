import { expect, test } from 'bun:test'
import { PACKAGE } from './index'

test('@compass_agents/brain-venice package identity', () => {
  expect(PACKAGE).toBe('@compass_agents/brain-venice')
})
