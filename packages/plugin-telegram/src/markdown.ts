/**
 * Telegram MarkdownV2 helpers. The Bot API requires every reserved char outside
 * a formatting marker to be backslash-escaped, or the send parse-errors. We send
 * plain text by default (safe) and offer escaping + a strip fallback — the lean
 * subset compass needs.
 */
const MARKDOWN_V2_ESCAPE_REGEX = /([_*[\]()~`>#+\-=|{}.!\\])/g

/** Escape all MarkdownV2 reserved characters in plain text. */
export function escapeMarkdownV2(text: string): string {
  return text.replace(MARKDOWN_V2_ESCAPE_REGEX, '\\$1')
}

/**
 * Strip MarkdownV2 markers so a parse-error fallback can resend as plain text.
 * Handles the common markers and drops escape backslashes.
 */
export function stripMarkdownV2(text: string): string {
  let out = text
  out = out.replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, '$1')
  out = out.replace(/\|\|([^|]+)\|\|/g, '$1')
  out = out.replace(/\*([^*]+)\*/g, '$1')
  out = out.replace(/~([^~]+)~/g, '$1')
  return out
}

/** Detect a Bot API MarkdownV2 parse error so callers can fall back to plain text. */
export function isMarkdownParseError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return msg.includes("can't parse entities") || msg.includes('can t parse entities')
}
