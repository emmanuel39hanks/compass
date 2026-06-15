import type { Brain, BrainInferInput, BrainTurn } from './types'

/**
 * Deterministic brain for tests and offline runs. Returns pre-scripted turns
 * in order; once exhausted, returns a terminal text turn. Records every
 * `infer` input on `.calls` for assertions.
 */
export class StubBrain implements Brain {
  private cursor = 0
  readonly calls: BrainInferInput[] = []

  constructor(private readonly script: BrainTurn[]) {}

  infer(input: BrainInferInput): Promise<BrainTurn> {
    this.calls.push(input)
    const turn = this.script[this.cursor]
    this.cursor++
    if (!turn) return Promise.resolve({ content: '(stub: no more scripted turns)', toolCalls: [] })
    return Promise.resolve(turn)
  }
}
