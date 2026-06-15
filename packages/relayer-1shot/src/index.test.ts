import { expect, test } from 'bun:test'
import { PACKAGE } from './index'

test('@compass_agents/relayer-1shot package identity', () => {
  expect(PACKAGE).toBe('@compass_agents/relayer-1shot')
})
