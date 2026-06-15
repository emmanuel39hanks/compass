import type { Hex } from 'viem'

export interface Peer {
  name: string
  address: Hex
  /** Optional ECIES/encryption pubkey for private transports. */
  pubkey?: Hex
}

/** Name → peer directory for agent-to-agent coordination. */
export class PeerRegistry {
  private readonly peers = new Map<string, Peer>()

  add(peer: Peer): void {
    this.peers.set(peer.name, peer)
  }

  get(name: string): Peer | undefined {
    return this.peers.get(name)
  }

  has(name: string): boolean {
    return this.peers.has(name)
  }

  resolve(name: string): Peer {
    const peer = this.peers.get(name)
    if (!peer) throw new Error(`unknown peer: ${name}`)
    return peer
  }

  list(): Peer[] {
    return [...this.peers.values()]
  }
}
