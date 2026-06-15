import type { AgentCard } from '@compass_agents/delegation'
import type { Hex } from 'viem'
import type { EnvelopeHandler, Transport } from './bus'
import { type SealedMessage, openEnvelope, sealEnvelope } from './crypto'
import type { A2AEnvelope } from './envelope'

/** Where a peer agent lives + how to seal to it. */
export interface HttpPeer {
  name: string
  /** Base URL of the peer's A2A server, e.g. `http://host:4310`. */
  endpoint: string
  /** The peer's compressed pubkey (from its on-chain record) — seal to this. */
  pubkey: Hex
}

/** Resolve a peer name → its endpoint + pubkey (registry + AgentCard, or a cache). */
export type PeerResolver = (name: string) => HttpPeer | undefined | Promise<HttpPeer | undefined>

export const A2A_PATH = '/a2a'
export const AGENT_CARD_PATH = '/.well-known/agent-card.json'

export interface HttpTransportOpts {
  selfName: string
  /** This agent's key — signs outbound, decrypts inbound. */
  selfKey: Hex
  resolvePeer: PeerResolver
  fetchImpl?: typeof fetch
}

/**
 * A real A2A transport over HTTP: outbound envelopes are sealed (signed + ECIES
 * to the peer's pubkey) and POSTed to the peer's `/a2a`; inbound sealed messages
 * are opened (sender verified, payload decrypted) and dispatched to local
 * handlers. Drop-in for the in-process bus — same `Transport` shape, real wire.
 */
export class HttpTransport implements Transport {
  readonly selfName: string
  private readonly selfKey: Hex
  private readonly resolvePeer: PeerResolver
  private readonly fetchImpl: typeof fetch
  private readonly handlers = new Map<string, Set<EnvelopeHandler>>()

  constructor(opts: HttpTransportOpts) {
    this.selfName = opts.selfName
    this.selfKey = opts.selfKey
    this.resolvePeer = opts.resolvePeer
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  async send(envelope: A2AEnvelope): Promise<void> {
    const peer = await this.resolvePeer(envelope.to)
    if (!peer) throw new Error(`cannot route to unknown peer "${envelope.to}"`)
    const sealed = sealEnvelope(envelope, this.selfKey, peer.pubkey)
    const res = await this.fetchImpl(new URL(A2A_PATH, peer.endpoint).toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sealed),
    })
    if (!res.ok) throw new Error(`a2a send to "${envelope.to}" failed: HTTP ${res.status}`)
  }

  subscribe(name: string, handler: EnvelopeHandler): () => void {
    const set = this.handlers.get(name) ?? new Set<EnvelopeHandler>()
    set.add(handler)
    this.handlers.set(name, set)
    return () => set.delete(handler)
  }

  /**
   * Open a sealed message (verify sender against its published pubkey, decrypt)
   * and dispatch to local handlers. The agent server calls this on inbound POST.
   */
  async deliver(sealed: SealedMessage): Promise<void> {
    const sender = await this.resolvePeer(sealed.from)
    const envelope = openEnvelope(sealed, this.selfKey, sender?.pubkey)
    const set = this.handlers.get(envelope.to)
    if (!set) return
    for (const handler of set) await handler(envelope)
  }
}

export interface ServeOpts {
  transport: HttpTransport
  /** Served at `/.well-known/agent-card.json` for discovery. */
  card: AgentCard
  port?: number
  hostname?: string
}

export interface AgentServer {
  port: number
  url: string
  stop: () => void
}

/**
 * Serve an agent over HTTP: its AgentCard (discovery) + the `/a2a` inbox. Bun's
 * server; pass `port: 0` for an ephemeral port (returned on `.port`).
 */
export function serveAgent(opts: ServeOpts): AgentServer {
  const hostname = opts.hostname ?? '127.0.0.1'
  const server = Bun.serve({
    port: opts.port ?? 0,
    hostname,
    fetch: async (req: Request): Promise<Response> => {
      const url = new URL(req.url)
      if (req.method === 'GET' && url.pathname === AGENT_CARD_PATH) {
        return Response.json(opts.card)
      }
      if (req.method === 'POST' && url.pathname === A2A_PATH) {
        try {
          const sealed = (await req.json()) as SealedMessage
          await opts.transport.deliver(sealed)
          return Response.json({ ok: true })
        } catch (err) {
          return Response.json({ ok: false, error: (err as Error).message }, { status: 400 })
        }
      }
      return new Response('not found', { status: 404 })
    },
  })
  const port = server.port ?? opts.port ?? 0
  return {
    port,
    url: `http://${hostname}:${port}`,
    stop: () => server.stop(true),
  }
}

/** Fetch + parse a peer's AgentCard from its base URL (discovery / presence). */
export async function fetchAgentCard(
  endpoint: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AgentCard> {
  const res = await fetchImpl(new URL(AGENT_CARD_PATH, endpoint).toString())
  if (!res.ok) throw new Error(`agent-card fetch failed: HTTP ${res.status}`)
  return (await res.json()) as AgentCard
}
