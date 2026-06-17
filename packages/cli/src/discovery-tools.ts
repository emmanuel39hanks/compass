import type { ToolDef } from '@compass_agents/core'
import { type X402Service, discoverX402Services, filterServices } from '@compass_agents/x402'
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
      limit: z.number().int().min(1).max(50).optional(),
    }),
    run: async args => {
      try {
        // Fetch the whole catalog, then keyword-filter locally — so a natural-language
        // query still matches, and we can fall back to showing the catalog.
        const all = await discoverX402Services({
          ...(opts.url ? { url: opts.url } : {}),
          ...(opts.headers ? { headers: opts.headers } : {}),
          ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
        })
        if (all.length === 0) {
          return { content: 'the x402 Bazaar returned no listings right now', ok: true }
        }
        const limit = args.limit ?? 12
        // One entry per service: description first (it's what you read), then a
        // compact price·network line, then the URL on its own line so it's easy to
        // read and click (the TUI renders URLs as clickable links).
        const fmt = (list: X402Service[]) =>
          list
            .map((s, i) => {
              const desc =
                s.description.length > 110 ? `${s.description.slice(0, 107)}…` : s.description
              const price = s.price === 'free' ? 'free' : s.price
              return `${i + 1}. ${desc}\n   ${price} · ${s.network}\n   ${s.resource}`
            })
            .join('\n\n')
        const matched = filterServices(all, args.query, limit)
        if (matched.length > 0)
          return {
            content: `${matched.length} payable ${matched.length === 1 ? 'service' : 'services'} on the x402 Bazaar:\n\n${fmt(matched)}\n\nBuy one with  /pay <url>.`,
            ok: true,
          }
        return {
          content: `nothing matched "${args.query ?? ''}" — here are ${Math.min(limit, all.length)} of the ${all.length} services on the Bazaar:\n\n${fmt(all.slice(0, limit))}\n\nBuy one with  /pay <url>.`,
          ok: true,
        }
      } catch (err) {
        return { content: `discovery unavailable: ${(err as Error).message}`, ok: false }
      }
    },
  }
  return [discover]
}
