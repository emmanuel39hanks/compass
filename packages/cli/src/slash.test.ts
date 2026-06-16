import { expect, test } from 'bun:test'
import { ApprovalGate, type ToolDef, ToolRegistry } from '@compass_agents/core'
import { z } from 'zod'
import type { ChatSession } from './chat'
import { handleSlash } from './slash'

function session(extra: ToolDef[] = []): ChatSession {
  const tools = new ToolRegistry()
  for (const t of extra) tools.register(t)
  return {
    brain: {} as never,
    tools,
    gate: new ApprovalGate({ mode: 'off' }),
    ctx: { memory: undefined as never },
    system: 'sys',
  }
}

const balanceTool: ToolDef<Record<string, never>> = {
  name: 'chain.balance',
  description: '',
  schema: z.object({}),
  run: () => ({ content: '5 USDC on Base Sepolia', ok: true }),
}
const sendTool: ToolDef<{ to: string; amount: string }> = {
  name: 'chain.send',
  description: '',
  dangerous: true,
  schema: z.object({ to: z.string().regex(/^0x[0-9a-fA-F]{40}$/), amount: z.string() }),
  run: a => ({ content: `sent ${a.amount} to ${a.to}`, ok: true }),
}

test('plain English is not treated as a command', async () => {
  expect((await handleSlash(session(), 'what is my balance')).handled).toBe(false)
})

test('/exit signals exit', async () => {
  expect((await handleSlash(session(), '/exit')).exit).toBe(true)
})

test('/help lists the commands', async () => {
  const r = await handleSlash(session([balanceTool]), '/help')
  expect(r.output).toContain('/balance')
  expect(r.output).toContain('/send')
})

test('/balance dispatches chain.balance', async () => {
  const r = await handleSlash(session([balanceTool]), '/balance')
  expect(r.output).toBe('5 USDC on Base Sepolia')
})

test('/send parses amount + address and dispatches', async () => {
  const addr = '0xC495953DE50Ac375e3c564F4Acd4Cc48949576AE'
  const r = await handleSlash(session([sendTool]), `/send 0.5 ${addr}`)
  expect(r.output).toBe(`sent 0.5 to ${addr}`)
})

test('/send with missing args shows usage', async () => {
  const r = await handleSlash(session([sendTool]), '/send 0.5')
  expect(r.output).toContain('usage: /send')
})

test('a command whose tool is not registered is unavailable', async () => {
  const r = await handleSlash(session(), '/balance')
  expect(r.output).toContain("isn't available")
})

test('unknown command', async () => {
  const r = await handleSlash(session([balanceTool]), '/frobnicate')
  expect(r.output).toContain('unknown command')
})
