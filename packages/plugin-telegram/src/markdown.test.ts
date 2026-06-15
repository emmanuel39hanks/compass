import { expect, test } from 'bun:test'
import { escapeMarkdownV2, isMarkdownParseError, stripMarkdownV2 } from './markdown'

test('escapeMarkdownV2 backslash-escapes every reserved char', () => {
  expect(escapeMarkdownV2('a.b-c!')).toBe('a\\.b\\-c\\!')
  expect(escapeMarkdownV2('(x)[y]')).toBe('\\(x\\)\\[y\\]')
})

test('stripMarkdownV2 removes markers + escape backslashes', () => {
  expect(stripMarkdownV2('*bold*')).toBe('bold')
  expect(stripMarkdownV2('a\\.b')).toBe('a.b')
  expect(stripMarkdownV2('||secret||')).toBe('secret')
})

test('isMarkdownParseError detects the Bot API parse error', () => {
  expect(isMarkdownParseError(new Error("Bad Request: can't parse entities"))).toBe(true)
  expect(isMarkdownParseError(new Error('network timeout'))).toBe(false)
})
