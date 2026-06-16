/**
 * x402 Bazaar discovery — the "search engine for agents" layer. The agent can
 * list and search payable x402 resources (datasets, APIs, compute) by keyword,
 * see the price + network, then pay & fetch the chosen one with {@link payFetch}.
 * Turns "give me a URL" into autonomous sourcing.
 */

export interface X402Service {
  /** The URL to pay for and fetch. */
  resource: string
  description: string
  /** Human-readable price, e.g. "0.01 USDC". */
  price: string
  network: string
  mimeType?: string
}

/** A single payment requirement as advertised in a discovery catalog. */
interface Accept {
  network?: string
  maxAmountRequired?: string | number
  asset?: string
  description?: string
  mimeType?: string
  resource?: string
  extra?: { name?: string; decimals?: number }
}

interface DiscoveryItem {
  resource?: string
  accepts?: Accept[]
  description?: string
}

export interface DiscoverOpts {
  /** Discovery endpoint. Defaults to the Coinbase CDP x402 Bazaar. */
  url?: string
  /** Case-insensitive filter over description + resource. */
  query?: string
  /** Max results to return (default 20). */
  limit?: number
  fetchImpl?: typeof fetch
  /** Extra headers (e.g. CDP auth) — the public catalog needs none. */
  headers?: Record<string, string>
}

export const DEFAULT_X402_DISCOVERY =
  'https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources'

/** Format an atomic amount as a human price (USDC-style 6 decimals by default). */
function priceOf(a: Accept): string {
  if (a.maxAmountRequired === undefined) return 'free'
  const decimals = a.extra?.decimals ?? 6
  const n = Number(a.maxAmountRequired) / 10 ** decimals
  const sym = a.extra?.name ?? 'USDC'
  return `${Number.isFinite(n) ? n : a.maxAmountRequired} ${sym}`
}

/** Normalize a discovery catalog (CDP `{ items: [...] }` or a bare array) to services. */
export function normalizeDiscovery(json: unknown): X402Service[] {
  const items: DiscoveryItem[] = Array.isArray(json)
    ? (json as DiscoveryItem[])
    : (((json as { items?: DiscoveryItem[] })?.items ?? []) as DiscoveryItem[])
  const out: X402Service[] = []
  for (const it of items) {
    const accept = it.accepts?.[0]
    const resource = it.resource ?? accept?.resource
    if (!resource) continue
    out.push({
      resource,
      description: accept?.description ?? it.description ?? '(no description)',
      price: accept ? priceOf(accept) : 'free',
      network: accept?.network ?? 'unknown',
      ...(accept?.mimeType ? { mimeType: accept.mimeType } : {}),
    })
  }
  return out
}

/** Apply a keyword filter + limit to a normalized service list. */
export function filterServices(services: X402Service[], query?: string, limit = 20): X402Service[] {
  const q = query?.trim().toLowerCase()
  const matched = q
    ? services.filter(
        s => s.description.toLowerCase().includes(q) || s.resource.toLowerCase().includes(q),
      )
    : services
  return matched.slice(0, limit)
}

/** Fetch the discovery catalog and return matching x402 services. */
export async function discoverX402Services(opts: DiscoverOpts = {}): Promise<X402Service[]> {
  const f = opts.fetchImpl ?? fetch
  const res = await f(opts.url ?? DEFAULT_X402_DISCOVERY, {
    headers: { accept: 'application/json', ...(opts.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`x402 discovery ${res.status}`)
  return filterServices(normalizeDiscovery(await res.json()), opts.query, opts.limit)
}
