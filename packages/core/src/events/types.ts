export type CompassEventKind = 'chat' | 'a2a' | 'webhook' | 'timer'

/** A trigger that wakes the brain for one turn. */
export interface CompassEvent {
  kind: CompassEventKind
  /** Human or peer text that prompts the turn. */
  text: string
  /** Conversation partition for history (TUI, a2a peer, …). */
  channelKey?: string
  /** Structured payload (webhook body, a2a envelope, …). */
  payload?: Record<string, unknown>
}
