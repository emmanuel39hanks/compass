import type { ToolDef } from '@compass_agents/core'
import type { RelayResult } from '@compass_agents/relayer-1shot'
import { type Address, type Hex, getAddress, parseUnits } from 'viem'
import { z } from 'zod'
import type { A2ACoordinator } from './coordinator'
import type { PeerRegistry } from './peers'

/**
 * The agent-facing A2A tool surface: discover peers, ask a peer to do work, and
 * redelegate authority to a peer. Registering these makes redelegation a
 * first-class agent capability.
 */
export function makeA2ATools(coordinator: A2ACoordinator, registry: PeerRegistry): ToolDef[] {
  const peers: ToolDef<Record<string, never>> = {
    name: 'a2a.peers',
    description: 'List known agent peers.',
    schema: z.object({}),
    run: () => {
      const list = registry.list()
      const body = list.length ? list.map(p => `${p.name} ${p.address}`).join('\n') : '(no peers)'
      return { content: body, ok: true }
    },
  }

  const peerAdd: ToolDef<{ name: string; address: string }> = {
    name: 'a2a.peer_add',
    description: 'Add an agent peer to the directory.',
    schema: z.object({
      name: z.string().min(1),
      address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    }),
    run: args => {
      registry.add({ name: args.name, address: args.address as Hex })
      return { content: `added peer ${args.name}`, ok: true }
    },
  }

  const request: ToolDef<{ peer: string; task: string; note?: string }> = {
    name: 'a2a.request',
    description: 'Ask a peer agent to perform a task under a bounded grant.',
    schema: z.object({
      peer: z.string().min(1),
      task: z.string().min(1),
      note: z.string().optional(),
    }),
    run: async args => {
      await coordinator.request(args.peer, args.task, args.note)
      return { content: `requested "${args.task}" from ${args.peer}`, ok: true }
    },
  }

  const grant: ToolDef<{ peer: string }> = {
    name: 'a2a.grant',
    description: 'Redelegate a narrowed slice of this agent’s authority to a peer agent.',
    dangerous: true,
    schema: z.object({ peer: z.string().min(1) }),
    run: async args => {
      const delegation = await coordinator.grant(args.peer)
      return {
        content: `granted authority to ${args.peer} (delegate=${delegation.delegate})`,
        ok: true,
      }
    },
  }

  return [peers, peerAdd, request, grant]
}

export interface HireToolDeps {
  /** Hire a helper agent to move USDC on the owner's behalf (on-chain, within a budget). */
  hire: (args: {
    to: Address
    amount: bigint
    helper?: string
    task?: string
  }) => Promise<RelayResult & { helper?: string }>
  /** Revoke a helper's last grant on-chain (optional). */
  revoke?: (helper: string) => Promise<{ hash: string }>
  decimals?: number
}

/**
 * The hire tool surface: let the agent hire a helper to act within a revocable,
 * one-time budget, and revoke that authority on-chain. The "agents hire agents"
 * capability, wired to the real on-chain redelegation + 1Shot redemption.
 */
export function makeHireTools(deps: HireToolDeps): ToolDef[] {
  const decimals = deps.decimals ?? 6

  const hire: ToolDef<{ to: string; amount: string; helper?: string; task?: string }> = {
    name: 'a2a.hire',
    description:
      'Hire a helper agent to send USDC on your behalf. You grant a one-time budget; ' +
      'the helper executes the transfer on-chain within it. Gas is paid in USDC, no ETH.',
    dangerous: true,
    schema: z.object({
      to: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      amount: z.string().regex(/^\d+(\.\d+)?$/),
      helper: z.string().optional(),
      task: z.string().optional(),
    }),
    run: async args => {
      const res = await deps.hire({
        to: getAddress(args.to),
        amount: parseUnits(args.amount, decimals),
        ...(args.helper ? { helper: args.helper } : {}),
        ...(args.task ? { task: args.task } : {}),
      })
      const ok = res.status >= 200 && res.status < 300
      const tx = res.hash ? ` · tx ${res.hash.slice(0, 12)}…` : ''
      return {
        content: `${ok ? '✓' : '…'} hired ${res.helper ?? 'a helper'} to send ${args.amount} USDC to ${args.to} — task ${res.taskId.slice(0, 12)}… (status ${res.status})${tx}`,
        ok,
      }
    },
  }

  const tools: ToolDef[] = [hire]

  if (deps.revoke) {
    const revoke = deps.revoke
    tools.push({
      name: 'a2a.revoke',
      description:
        "Revoke a helper agent's authority on-chain. Its next attempted action will fail.",
      dangerous: true,
      schema: z.object({ helper: z.string().min(1) }),
      run: async (args: { helper: string }) => {
        const { hash } = await revoke(args.helper)
        return { content: `✓ revoked ${args.helper} — tx ${hash.slice(0, 12)}…`, ok: true }
      },
    } satisfies ToolDef<{ helper: string }>)
  }

  return tools
}
