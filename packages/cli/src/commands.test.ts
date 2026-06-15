import { expect, test } from 'bun:test'
import { COMMANDS, helpText, isKnownCommand, parseArgv } from './commands'

test('parseArgv extracts command, positional args, and flags', () => {
  const p = parseArgv(['redelegate', 'worker', '--amount', '25', '--yes'])
  expect(p.name).toBe('redelegate')
  expect(p.args).toEqual(['worker'])
  expect(p.flags).toEqual({ amount: '25', yes: true })
})

test('parseArgv defaults to help with no args', () => {
  expect(parseArgv([]).name).toBe('help')
})

test('isKnownCommand recognises known and rejects unknown', () => {
  expect(isKnownCommand('demo')).toBe(true)
  expect(isKnownCommand('frobnicate')).toBe(false)
})

test('helpText lists every command', () => {
  const h = helpText()
  for (const c of COMMANDS) expect(h).toContain(c)
})
