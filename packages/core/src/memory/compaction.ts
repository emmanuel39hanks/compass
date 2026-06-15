import type { BrainMessage } from '../brain/types'

export type Summarizer = (messages: BrainMessage[]) => Promise<string>

export interface CompactOpts {
  /** Compact once history exceeds this many messages. Default 40. */
  threshold?: number
  /** Keep at least this many recent messages verbatim. Default 12. */
  keepRecent?: number
  summarize: Summarizer
}

/**
 * Fold older turns into one summary message when history grows past `threshold`,
 * keeping recent turns verbatim — continuity without unbounded prompt growth.
 * The recent window snaps to a `user` boundary so no orphan `tool` message (one
 * whose `assistant` tool-call got summarized away) is left behind.
 */
export async function compactHistory(
  messages: BrainMessage[],
  opts: CompactOpts,
): Promise<BrainMessage[]> {
  const threshold = opts.threshold ?? 40
  const keepRecent = opts.keepRecent ?? 12
  if (messages.length <= threshold) return messages

  // Snap the recent window back to the nearest user turn so we never keep an
  // orphan `tool` message whose `assistant` tool-call got summarized away.
  let cut = messages.length - keepRecent
  while (cut > 0 && messages[cut]?.role !== 'user') cut--

  const older = messages.slice(0, cut)
  if (older.length === 0) return messages
  const recent = messages.slice(cut)
  const summary = await opts.summarize(older)
  return [{ role: 'system', content: `Summary of earlier conversation:\n${summary}` }, ...recent]
}
