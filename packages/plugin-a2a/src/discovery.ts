import { type AgentCard, type Peer, discoverPeer } from '@compass_agents/delegation'
import type { Address, PublicClient } from 'viem'
import type { HttpPeer, PeerResolver } from './http'

/** Fetch an AgentCard from its exact URI (the on-chain `agentCardURI`). */
async function fetchCardUri(uri: string, fetchImpl: typeof fetch): Promise<AgentCard> {
  const res = await fetchImpl(uri)
  if (!res.ok) throw new Error(`agent-card fetch failed: HTTP ${res.status}`)
  return (await res.json()) as AgentCard
}

export interface RegistryResolverOpts {
  client: PublicClient
  registry: Address
  fetchImpl?: typeof fetch
  /** Pre-seeded peers + memoization of resolved ones (name → HttpPeer). */
  cache?: Map<string, HttpPeer>
  /** Override the endpoint (e.g. local demos where there's no public AgentCard). */
  endpointFor?: (peer: Peer) => string | undefined
}

/**
 * A {@link PeerResolver} backed by the on-chain registry: resolve a handle to its
 * record (messaging pubkey + AgentCard URI), then read the AgentCard for the A2A
 * endpoint. Memoized. This is how an agent reaches a peer it has never met — by
 * name — and gets the pubkey it needs to seal a grant only that peer can open.
 */
export function registryResolver(opts: RegistryResolverOpts): PeerResolver {
  const cache = opts.cache ?? new Map<string, HttpPeer>()
  const fetchImpl = opts.fetchImpl ?? fetch
  return async (name: string): Promise<HttpPeer | undefined> => {
    const cached = cache.get(name)
    if (cached) return cached

    let peer: Peer
    try {
      peer = await discoverPeer(opts.client, opts.registry, name)
    } catch {
      return undefined // not registered
    }
    if (!peer.pubkey || peer.pubkey === '0x') return undefined // no messaging key published

    let endpoint = opts.endpointFor?.(peer)
    if (!endpoint && peer.agentCardURI) {
      try {
        endpoint = (await fetchCardUri(peer.agentCardURI, fetchImpl)).url
      } catch {
        /* no reachable card */
      }
    }
    if (!endpoint) return undefined

    const resolved: HttpPeer = { name, endpoint, pubkey: peer.pubkey }
    cache.set(name, resolved)
    return resolved
  }
}
