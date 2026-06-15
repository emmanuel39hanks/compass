import type { A2AEnvelope } from './envelope'

export type EnvelopeHandler = (envelope: A2AEnvelope) => void | Promise<void>

export interface Transport {
  send(envelope: A2AEnvelope): Promise<void>
  subscribe(name: string, handler: EnvelopeHandler): () => void
}

/**
 * In-process transport for the demo. The same envelope (a signed delegation)
 * can ride any channel — only the pipe changes.
 */
export class InProcessBus implements Transport {
  private readonly handlers = new Map<string, Set<EnvelopeHandler>>()

  async send(envelope: A2AEnvelope): Promise<void> {
    const set = this.handlers.get(envelope.to)
    if (!set) return
    for (const handler of set) await handler(envelope)
  }

  subscribe(name: string, handler: EnvelopeHandler): () => void {
    const set = this.handlers.get(name) ?? new Set<EnvelopeHandler>()
    set.add(handler)
    this.handlers.set(name, set)
    return () => set.delete(handler)
  }
}
