import type { ToolDef } from '@compass_agents/core'
import { type Address, formatUnits, getAddress, parseUnits } from 'viem'
import { z } from 'zod'

/**
 * Live on-chain capabilities for the chat agent, injected so the tools stay
 * testable. The bin wires the real readers/relayer; tests pass mocks.
 */
export interface OnchainDeps {
  account: Address
  /** USDC balance of the account, in base units. */
  readUsdcBalance: () => Promise<bigint>
  /** Send USDC on-chain (gasless via 1Shot, within budget). */
  sendUsdc: (
    to: Address,
    amount: bigint,
  ) => Promise<{ taskId: string; status: number; hash?: string }>
  decimals?: number
}

export function makeOnchainTools(deps: OnchainDeps): ToolDef[] {
  const decimals = deps.decimals ?? 6

  const balance: ToolDef<Record<string, never>> = {
    name: 'chain.balance',
    description: "Check the agent's USDC balance.",
    schema: z.object({}),
    run: async () => ({
      content: `${formatUnits(await deps.readUsdcBalance(), decimals)} USDC`,
      ok: true,
    }),
  }

  const send: ToolDef<{ to: string; amount: string }> = {
    name: 'chain.send',
    description:
      'Send USDC to an address. Executes on-chain within the budget; gas paid in USDC, no ETH.',
    dangerous: true,
    schema: z.object({
      to: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      amount: z.string().regex(/^\d+(\.\d+)?$/),
    }),
    run: async args => {
      // Lowercase first: the schema already proved it's 40 hex chars, so this
      // re-derives the correct EIP-55 checksum instead of throwing when the user
      // pasted an address with non-canonical casing.
      const to = getAddress(args.to.toLowerCase())
      const res = await deps.sendUsdc(to, parseUnits(args.amount, decimals))
      const ok = res.status >= 200 && res.status < 300
      const tx = res.hash ? ` · tx ${res.hash.slice(0, 12)}…` : ''
      return {
        content: `${ok ? '✓' : '…'} sent ${args.amount} USDC to ${args.to} — task ${res.taskId.slice(0, 12)}… (status ${res.status})${tx}`,
        ok,
      }
    },
  }

  return [balance, send]
}
