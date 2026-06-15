import {
  type Caveats,
  type Delegation,
  type SmartAccountsEnvironment,
  randomSalt,
  redelegate,
} from '@compass_agents/delegation'
import type { Hex } from 'viem'
import type { Transport } from './bus'
import type { A2AEnvelope } from './envelope'
import type { PeerRegistry } from './peers'

export interface A2ACoordinatorOpts {
  selfName: string
  selfAddress: Hex
  environment: SmartAccountsEnvironment
  registry: PeerRegistry
  transport: Transport
  /** The delegation this agent holds and may narrow + redelegate onward. */
  parentAuthority?: Delegation
}

export interface GrantOptions {
  caveats?: Caveats
  salt?: Hex
}

/** Decide whether/how to grant in response to an incoming request. */
export type RequestPolicy = (
  envelope: A2AEnvelope,
) => Promise<GrantOptions | null> | GrantOptions | null

/**
 * Drives agent-to-agent coordination by redelegation: hold authority, narrow
 * and pass slices to peers, redeem, revoke. This is the Best A2A Coordination
 * spine. See docs/ARCHITECTURE.md#a2a.
 */
export class A2ACoordinator {
  readonly name: string
  private readonly address: Hex
  private readonly environment: SmartAccountsEnvironment
  private readonly registry: PeerRegistry
  private readonly transport: Transport
  private parentAuthority: Delegation | undefined

  constructor(opts: A2ACoordinatorOpts) {
    this.name = opts.selfName
    this.address = opts.selfAddress
    this.environment = opts.environment
    this.registry = opts.registry
    this.transport = opts.transport
    this.parentAuthority = opts.parentAuthority
  }

  /** Set/replace the authority this agent holds (e.g. a fresh root or 7715 grant). */
  setAuthority(delegation: Delegation): void {
    this.parentAuthority = delegation
  }

  hasAuthority(): boolean {
    return this.parentAuthority !== undefined
  }

  /** Redelegate a narrowed slice of authority to a peer and ship the delegation. */
  async grant(peerName: string, opts: GrantOptions = {}): Promise<Delegation> {
    if (!this.parentAuthority) throw new Error(`${this.name} holds no authority to redelegate`)
    const peer = this.registry.resolve(peerName)
    const child = redelegate({
      environment: this.environment,
      from: this.address,
      to: peer.address,
      parent: this.parentAuthority,
      ...(opts.caveats ? { caveats: opts.caveats } : {}),
      salt: opts.salt ?? randomSalt(),
    })
    await this.transport.send({ from: this.name, to: peerName, kind: 'grant', delegation: child })
    return child
  }

  /** Ask a peer to perform a task (optionally with a budget note). */
  async request(peerName: string, task: string, note?: string): Promise<void> {
    this.registry.resolve(peerName)
    await this.transport.send({
      from: this.name,
      to: peerName,
      kind: 'request',
      task,
      ...(note ? { note } : {}),
    })
  }

  /** Pull authority back: emit a revoke (the on-chain disable is encoded separately). */
  async revoke(peerName: string, delegation: Delegation): Promise<void> {
    await this.transport.send({ from: this.name, to: peerName, kind: 'revoke', delegation })
  }

  /** Auto-respond to incoming requests by granting per a policy. */
  onRequest(policy: RequestPolicy): () => void {
    return this.transport.subscribe(this.name, async envelope => {
      if (envelope.kind !== 'request') return
      const grantOpts = await policy(envelope)
      if (grantOpts) await this.grant(envelope.from, grantOpts)
    })
  }

  /** Subscribe to all envelopes addressed to this agent. */
  on(handler: (envelope: A2AEnvelope) => void | Promise<void>): () => void {
    return this.transport.subscribe(this.name, handler)
  }
}
