import type { CompassConfig, ToolDef } from '@compass_agents/core'
import {
  COMPASS_AGENT_REGISTRY,
  REPUTATION_REGISTRY,
  readReputation,
  resolveAgent,
} from '@compass_agents/delegation'
import { http, type PublicClient, createPublicClient } from 'viem'
import { z } from 'zod'

/**
 * `a2a.reputation` — check an agent's on-chain reputation by name before hiring it
 * (ERC-8004). Falls back to identity-only when no ReputationRegistry is deployed
 * for the chain, and never throws — so it's safe to offer everywhere.
 */
export function makeReputationTools(
  config: CompassConfig,
  deps: { client?: PublicClient } = {},
): ToolDef[] {
  const chainId = config.network.chainId
  // Read-only client (no chain) so it stays a plain PublicClient for resolveAgent.
  const client = deps.client ?? createPublicClient({ transport: http(config.network.rpcUrl) })
  const identity = COMPASS_AGENT_REGISTRY[chainId]
  const repRegistry = REPUTATION_REGISTRY[chainId]

  const reputation: ToolDef<{ agent: string }> = {
    name: 'a2a.reputation',
    description:
      "Check an agent's on-chain reputation by name before hiring it (ERC-8004) — " +
      'the average score and how many clients rated it.',
    schema: z.object({ agent: z.string().min(1).describe('The agent handle, e.g. "scout".') }),
    run: async args => {
      if (!identity) return { content: `no agent registry on chain ${chainId}`, ok: false }
      try {
        const { agentId, owner } = await resolveAgent(client, identity, args.agent)
        if (agentId === 0n) return { content: `no agent named "${args.agent}"`, ok: false }
        if (!repRegistry) {
          return {
            content: `${args.agent} is registered (agent #${agentId}, owner ${owner.slice(0, 10)}…). No reputation registry is deployed on this chain yet — identity only.`,
            ok: true,
          }
        }
        const r = await readReputation({ client, registry: repRegistry, agentId })
        return {
          content:
            r.count === 0
              ? `${args.agent} (agent #${agentId}) has no ratings yet.`
              : `${args.agent} (agent #${agentId}): score ${r.score} from ${r.count} client(s).`,
          ok: true,
        }
      } catch (err) {
        return { content: `reputation lookup failed: ${(err as Error).message}`, ok: false }
      }
    },
  }
  return [reputation]
}
