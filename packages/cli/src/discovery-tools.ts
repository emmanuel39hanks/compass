import type { ToolDef } from '@compass_agents/core'
import { discoverX402Services } from '@compass_agents/x402'
import { z } from 'zod'

export interface DiscoveryToolOpts {
  /** Override the x402 Bazaar discovery endpoint. */
  url?: string
  /** Extra headers (e.g. CDP auth) for the discovery call. */
  headers?: Record<string, string>
  /** Injectable fetch (tests). */
  fetchImpl?: typeof fetch
}

/**
 * `discover` — search the x402 Bazaar for payable datasets/APIs/services. Pairs
 * with the `pay` tool: discover a resource, then buy it from a delegated budget.
 * This is what turns "give me a URL" into the agent sourcing data on its own.
 */
export function makeDiscoveryTools(opts: DiscoveryToolOpts = {}): ToolDef[] {
  const discover: ToolDef<{ query?: string; limit?: number }> = {
    name: 'discover',
    description:
      'Search the x402 Bazaar for payable datasets, APIs, and services you can buy. ' +
      'Returns each resource URL, price, and network — then use `pay` to purchase one.',
    schema: z.object({
      query: z.string().optional().describe('Keyword, e.g. "crypto prices", "weather".'),
      limit: z.number().int().positive().max(50).optional(),
    }),
    run: async args => {
      try {
        const services = await discoverX402Services({
          ...(opts.url ? { url: opts.url } : {}),
          ...(opts.headers ? { headers: opts.headers } : {}),
          ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
          ...(args.query ? { query: args.query } : {}),
          ...(args.limit ? { limit: args.limit } : {}),
        })
        if (services.length === 0) return { content: 'no matching x402 services found', ok: true }
        const lines = services.map(
          s => `• ${s.resource} — ${s.description} (${s.price}, ${s.network})`,
        )
        return { content: `found ${services.length}:\n${lines.join('\n')}`, ok: true }
      } catch (err) {
        return { content: `discovery unavailable: ${(err as Error).message}`, ok: false }
      }
    },
  }
  return [discover]
}
