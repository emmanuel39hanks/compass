import type { ApprovalChoice } from '@compass_agents/gateway'

/**
 * Inline-keyboard approvals for dangerous tools when the active surface is
 * Telegram. 4 buttons, 2 rows: Once / Session / Always / Deny. Callback data:
 * `ea:<choice>:<approvalId>`. The handler re-validates the clicker (buttons are
 * visible to any chat member) and pops the resolver once.
 */

/** Minimal Bot API inline-keyboard shape (no grammy dependency). */
export interface InlineKeyboardButton {
  text: string
  callback_data: string
}
export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][]
}

export const APPROVAL_CALLBACK_PREFIX = 'ea'

function makeCallbackData(choice: ApprovalChoice, approvalId: string): string {
  return `${APPROVAL_CALLBACK_PREFIX}:${choice}:${approvalId}`
}

export function buildApprovalKeyboard(approvalId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Allow Once', callback_data: makeCallbackData('once', approvalId) },
        { text: '✅ Session', callback_data: makeCallbackData('session', approvalId) },
      ],
      [
        { text: '✅ Always', callback_data: makeCallbackData('always', approvalId) },
        { text: '❌ Deny', callback_data: makeCallbackData('deny', approvalId) },
      ],
    ],
  }
}

export interface ParsedCallback {
  choice: ApprovalChoice
  approvalId: string
}

export function parseCallbackData(data: string | undefined): ParsedCallback | null {
  if (!data) return null
  const parts = data.split(':')
  if (parts.length !== 3 || parts[0] !== APPROVAL_CALLBACK_PREFIX) return null
  const [, choice, approvalId] = parts
  if (!approvalId) return null
  if (choice !== 'once' && choice !== 'session' && choice !== 'always' && choice !== 'deny') {
    return null
  }
  return { choice, approvalId }
}

export type ResolveOutcome =
  | { kind: 'resolved'; approvalId: string; choice: ApprovalChoice; clicker: number }
  | { kind: 'unauthorized'; approvalId: string; clicker: number }
  | { kind: 'unknown-approval'; approvalId: string; clicker: number }
  | { kind: 'malformed' }

export interface HandleCallbackInput {
  callbackData: string | undefined
  fromUserId: number
  /** Empty = allow any paired clicker (the surface gates pairing upstream). */
  allowedUserIds: number[]
  pendingApprovals: Map<string, (choice: ApprovalChoice) => void>
}

/** Decide what a `callback_query` means; the caller then answers + acts. Pure. */
export function handleApprovalCallback(input: HandleCallbackInput): ResolveOutcome {
  const parsed = parseCallbackData(input.callbackData)
  if (!parsed) return { kind: 'malformed' }
  if (input.allowedUserIds.length > 0 && !input.allowedUserIds.includes(input.fromUserId)) {
    return { kind: 'unauthorized', approvalId: parsed.approvalId, clicker: input.fromUserId }
  }
  const resolver = input.pendingApprovals.get(parsed.approvalId)
  if (!resolver) {
    return { kind: 'unknown-approval', approvalId: parsed.approvalId, clicker: input.fromUserId }
  }
  input.pendingApprovals.delete(parsed.approvalId) // one-shot pop closes the double-click race
  resolver(parsed.choice)
  return {
    kind: 'resolved',
    approvalId: parsed.approvalId,
    choice: parsed.choice,
    clicker: input.fromUserId,
  }
}

/** Mint short, monotonic approval ids (fits callback_data's 64-byte budget). */
export function makeApprovalIdFactory(): () => string {
  let next = 1
  return () => `a-${next++}`
}
