import { expect, test } from 'bun:test'
import { splitMessage } from './chunking'

test('short text is a single chunk, unnumbered', () => {
  expect(splitMessage('hello')).toEqual(['hello'])
})

test('long text splits into numbered chunks under the limit', () => {
  const text = 'a '.repeat(3000) // 6000 chars
  const chunks = splitMessage(text, { maxLen: 4000 })
  expect(chunks.length).toBe(2)
  for (const c of chunks) expect(c.length).toBeLessThanOrEqual(4000 + 8)
  expect(chunks[0]?.endsWith('(1/2)')).toBe(true)
  expect(chunks[1]?.endsWith('(2/2)')).toBe(true)
})

test('numbered:false omits the suffixes', () => {
  const chunks = splitMessage('x'.repeat(50), { maxLen: 20, numbered: false })
  expect(chunks.length).toBeGreaterThan(1)
  expect(chunks.every(c => !/\(\d+\/\d+\)$/.test(c))).toBe(true)
})

test('splitting preserves fence markers and breaks at line boundaries', () => {
  const code = `\`\`\`\n${'line\n'.repeat(20)}\`\`\``
  const text = `${'pad '.repeat(10)}${code}`
  const chunks = splitMessage(text, { maxLen: 50 })
  expect(chunks.length).toBeGreaterThan(1)
  // no ``` marker is lost or invented across the split
  const total = chunks
    .map(c => c.replace(/\s*\(\d+\/\d+\)$/, ''))
    .reduce((n, c) => n + (c.match(/```/g) || []).length, 0)
  expect(total).toBe(2)
})
