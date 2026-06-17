import type { ToolDef } from '@compass_agents/core'
import { type Address, formatEther, formatUnits, getAddress, parseUnits } from 'viem'
import { z } from 'zod'

/**
 * Live on-chain capabilities for the chat agent, injected so the tools stay
 * testable. The bin wires the real readers/relayer; tests pass mocks.
 */
export interface OnchainDeps {
  account: Address
  /** Human network name for chain-aware replies (e.g. "Base Sepolia"). */
  network?: string
  /** When a MetaMask budget is granted, the account it's granted FROM (the spendable source). */
  grantedFrom?: Address
  /** A MetaMask-granted spending budget, if one is active (e.g. "25 USDC/week"). */
  grantedBudget?: string
  /** USDC balance of the spendable account, in base units. */
  readUsdcBalance: () => Promise<bigint>
  /** Native ETH balance of the same account (gas indicator). */
  readEthBalance?: () => Promise<bigint>
  /** Read any ERC-20 (symbol, decimals, balance) for the spendable account. */
  readToken?: (token: Address) => Promise<{ symbol: string; decimals: number; balance: bigint }>
  /** Send USDC on-chain (gasless via 1Shot, within budget). */
  sendUsdc: (
    to: Address,
    amount: bigint,
  ) => Promise<{ taskId: string; status: number; hash?: string; reason?: string }>
  decimals?: number
}

export function makeOnchainTools(deps: OnchainDeps): ToolDef[] {
  const decimals = deps.decimals ?? 6

  const balance: ToolDef<Record<string, never>> = {
    name: 'chain.balance',
    description:
      "Check USDC (and ETH-for-gas) on the agent's network. With a MetaMask grant, reports the " +
      "granting wallet's balance — the spendable source — and the budget. States the network so you know which chain.",
    schema: z.object({}),
    run: async () => {
      const usdc = formatUnits(await deps.readUsdcBalance(), decimals)
      const where = deps.network ? ` on ${deps.network}` : ''
      const eth = deps.readEthBalance
        ? `, ${formatEther(await deps.readEthBalance())} ETH (gas)`
        : ''
      if (deps.grantedFrom) {
        const b = deps.grantedBudget
          ? ` · budget ${deps.grantedBudget}, spendable gaslessly via 1Shot`
          : ''
        return {
          content: `MetaMask ${deps.grantedFrom}${where}: ${usdc} USDC${eth}${b}`,
          ok: true,
        }
      }
      return { content: `${usdc} USDC${eth}${where} · wallet ${deps.account}`, ok: true }
    },
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
      // re-derives the correct EIP-55 checksum (the recipient address is valid).
      const to = getAddress(args.to.toLowerCase())
      let res: { taskId: string; status: number; hash?: string; reason?: string }
      try {
        res = await deps.sendUsdc(to, parseUnits(args.amount, decimals))
      } catch (err) {
        // The recipient is already validated — surface the REAL relayer error, and
        // when it's a null-address fault, name the true cause: the 1Shot relayer
        // could not redeem the granted ERC-7715 budget (not the recipient).
        const msg = (err as Error).message
        const redemption = /invalid address|value=null|redeem|permission context/i.test(msg)
        const hint = redemption
          ? ' — the 1Shot relayer could not redeem your granted ERC-7715 budget (the recipient address is valid). Re-run `compass connect` to refresh the grant.'
          : ''
        return {
          content: `the transfer to ${to} did not go through (the address is valid): ${msg}${hint}`,
          ok: false,
        }
      }
      const ok = res.status >= 200 && res.status < 300
      const tx = res.hash ? ` · tx ${res.hash.slice(0, 12)}…` : ''
      if (ok) {
        return {
          content: `✓ sent ${args.amount} USDC to ${to} — task ${res.taskId.slice(0, 12)}…${tx}`,
          ok: true,
        }
      }
      return {
        content: `the relayer did not confirm the transfer to ${to} (status ${res.status}, task ${res.taskId.slice(0, 12)}…)${res.reason ? `: ${res.reason}` : ''}. The recipient address is valid — this is a relayer/redemption issue, not an address problem.`,
        ok: false,
      }
    },
  }

  const tokenBalance: ToolDef<{ token: string }> = {
    name: 'chain.token',
    description:
      "Check the balance of ANY ERC-20 token by its contract address on the agent's network " +
      '(e.g. EURC, DAI, or any token) — not just USDC.',
    schema: z.object({
      token: z
        .string()
        .regex(/^0x[0-9a-fA-F]{40}$/)
        .describe('the ERC-20 token contract address'),
    }),
    run: async args => {
      if (!deps.readToken) return { content: 'token reads are not available here', ok: false }
      const t = getAddress(args.token.toLowerCase())
      const { symbol, decimals: d, balance: bal } = await deps.readToken(t)
      const who = deps.grantedFrom ?? deps.account
      return {
        content: `${formatUnits(bal, d)} ${symbol}${deps.network ? ` on ${deps.network}` : ''} · wallet ${who}`,
        ok: true,
      }
    },
  }

  return [balance, send, tokenBalance]
}
