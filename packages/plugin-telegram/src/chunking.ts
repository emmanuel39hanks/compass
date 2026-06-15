/**
 * Long-message chunking. Telegram's hard limit is 4096 chars/message. We split
 * at 4000 (room for a `(1/N)` suffix) and avoid breaking inside fenced code
 * blocks so formatting stays intact across chunks.
 */
const DEFAULT_MAX_LEN = 4000

export interface SplitOpts {
  maxLen?: number
  /** Add `(1/N)` suffixes to multi-chunk output. Default true. */
  numbered?: boolean
}

export function splitMessage(text: string, opts: SplitOpts = {}): string[] {
  const maxLen = opts.maxLen ?? DEFAULT_MAX_LEN
  const numbered = opts.numbered ?? true
  if (text.length <= maxLen) return [text]

  const chunks: string[] = []
  let cursor = 0
  while (cursor < text.length) {
    let end = Math.min(cursor + maxLen, text.length)
    if (end < text.length) {
      const segment = text.slice(cursor, end)
      const fences = (segment.match(/```/g) || []).length
      if (fences % 2 === 1) {
        // Don't split inside a code fence — back up to the last newline.
        const lastNewline = text.lastIndexOf('\n', end - 1)
        if (lastNewline > cursor) end = lastNewline
      } else {
        // Prefer a word/line boundary.
        const splitAt = Math.max(text.lastIndexOf(' ', end), text.lastIndexOf('\n', end))
        if (splitAt > cursor + Math.floor(maxLen / 2)) end = splitAt
      }
    }
    chunks.push(text.slice(cursor, end))
    cursor = end
    while (cursor < text.length && (text[cursor] === ' ' || text[cursor] === '\n')) cursor++
  }

  if (!numbered || chunks.length === 1) return chunks
  const total = chunks.length
  return chunks.map((c, i) => `${c} (${i + 1}/${total})`)
}
