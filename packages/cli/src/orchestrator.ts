import {
  ApprovalGate,
  type ApprovalMode,
  type Brain,
  type MemoryStore,
  type RunTurnResult,
  ToolRegistry,
  runTurn,
} from '@compass_agents/core'
import { type A2ACoordinator, type PeerRegistry, makeA2ATools } from '@compass_agents/plugin-a2a'

const DEFAULT_SYSTEM =
  'You are a compass agent. You coordinate with peer agents by redelegating ' +
  'scoped, revocable on-chain authority (ERC-7710). Use a2a tools to delegate ' +
  'work; never exceed the authority you hold.'

export interface CompassDeps {
  brain: Brain
  coordinator: A2ACoordinator
  registry: PeerRegistry
  memory: MemoryStore
  approvalsMode?: ApprovalMode
  system?: string
}

/**
 * Composition root: wires the Venice brain, the A2A coordinator's tools, and
 * the harness loop into a single chat surface.
 */
export class Compass {
  readonly tools = new ToolRegistry()
  private readonly gate: ApprovalGate

  constructor(private readonly deps: CompassDeps) {
    for (const tool of makeA2ATools(deps.coordinator, deps.registry)) this.tools.register(tool)
    this.gate = new ApprovalGate({ mode: deps.approvalsMode ?? 'off' })
  }

  chat(text: string): Promise<RunTurnResult> {
    return runTurn(
      { kind: 'chat', text },
      {
        brain: this.deps.brain,
        tools: this.tools,
        gate: this.gate,
        ctx: { memory: this.deps.memory },
        system: this.deps.system ?? DEFAULT_SYSTEM,
      },
    )
  }
}
