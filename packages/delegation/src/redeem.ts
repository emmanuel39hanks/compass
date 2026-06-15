import { ExecutionMode, createExecution } from '@metamask/smart-accounts-kit'
import type { Delegation, ExecutionStruct } from '@metamask/smart-accounts-kit'
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts'
import type { Address, Hex } from 'viem'

export { ExecutionMode }
export type { ExecutionStruct }

export interface ExecutionInput {
  target: Address
  value?: bigint
  callData?: Hex
}

export function execution(input: ExecutionInput): ExecutionStruct {
  return createExecution({
    target: input.target,
    value: input.value ?? 0n,
    callData: input.callData ?? '0x',
  })
}

/**
 * Encode a single-chain redemption for `DelegationManager.redeemDelegations`.
 * The delegate submits the chain `[leaf, …, root]` plus the executions to run
 * as the root delegator (subject to the intersection of all caveats).
 */
export function encodeRedeem(
  chain: Delegation[],
  executions: ExecutionStruct[],
  mode: ExecutionMode = ExecutionMode.SingleDefault,
): Hex {
  return DelegationManager.encode.redeemDelegations({
    delegations: [chain],
    modes: [mode],
    executions: [executions],
  }) as Hex
}

/** Encode an on-chain revocation of a delegation. */
export function encodeDisable(delegation: Delegation): Hex {
  return DelegationManager.encode.disableDelegation({ delegation }) as Hex
}
