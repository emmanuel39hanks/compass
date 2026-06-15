import { expect, test } from 'bun:test'
import type { ApprovalChoice } from '@compass_agents/gateway'
import {
  buildApprovalKeyboard,
  handleApprovalCallback,
  makeApprovalIdFactory,
  parseCallbackData,
} from './approval-keyboard'

test('keyboard has 4 choices with parseable callback data', () => {
  const kb = buildApprovalKeyboard('a-1')
  const datas = kb.inline_keyboard.flat().map(b => b.callback_data)
  expect(datas).toEqual(['ea:once:a-1', 'ea:session:a-1', 'ea:always:a-1', 'ea:deny:a-1'])
  expect(parseCallbackData('ea:deny:a-1')).toEqual({ choice: 'deny', approvalId: 'a-1' })
})

test('parseCallbackData rejects malformed data', () => {
  expect(parseCallbackData(undefined)).toBeNull()
  expect(parseCallbackData('ea:bogus:a-1')).toBeNull()
  expect(parseCallbackData('xx:once:a-1')).toBeNull()
  expect(parseCallbackData('ea:once')).toBeNull()
})

test('a valid click resolves the pending approval once', () => {
  const pending = new Map<string, (c: ApprovalChoice) => void>()
  let got: ApprovalChoice | undefined
  pending.set('a-1', c => {
    got = c
  })
  const out = handleApprovalCallback({
    callbackData: 'ea:session:a-1',
    fromUserId: 5,
    allowedUserIds: [5],
    pendingApprovals: pending,
  })
  expect(out.kind).toBe('resolved')
  expect(got).toBe('session')
  // one-shot: the entry is gone, a second click is unknown
  const out2 = handleApprovalCallback({
    callbackData: 'ea:once:a-1',
    fromUserId: 5,
    allowedUserIds: [5],
    pendingApprovals: pending,
  })
  expect(out2.kind).toBe('unknown-approval')
})

test('a click by a non-allowlisted user is unauthorized', () => {
  const pending = new Map<string, (c: ApprovalChoice) => void>([['a-1', () => {}]])
  const out = handleApprovalCallback({
    callbackData: 'ea:once:a-1',
    fromUserId: 9,
    allowedUserIds: [5],
    pendingApprovals: pending,
  })
  expect(out.kind).toBe('unauthorized')
  expect(pending.has('a-1')).toBe(true) // not consumed
})

test('approval id factory is monotonic', () => {
  const next = makeApprovalIdFactory()
  expect([next(), next(), next()]).toEqual(['a-1', 'a-2', 'a-3'])
})
