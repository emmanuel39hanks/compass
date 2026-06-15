import { ROOT_AUTHORITY, createDelegation } from '@metamask/smart-accounts-kit'
import type {
  Caveats,
  CreateDelegationOptions,
  Delegation,
  SmartAccountsEnvironment,
} from '@metamask/smart-accounts-kit'
import { hashDelegation } from '@metamask/smart-accounts-kit/utils'
import type { Hex } from 'viem'
import type { Scope } from './scopes'

export { ROOT_AUTHORITY }
export type { Delegation }

export interface RootDelegationInput {
  environment: SmartAccountsEnvironment
  /** Delegator (this agent / the principal). */
  from: Hex
  /** Delegate (the peer receiving authority). */
  to: Hex
  scope: Scope
  caveats?: Caveats
  salt?: Hex
}

/** A root delegation: `authority = ROOT_AUTHORITY`, granted from `from`. */
export function rootDelegation(input: RootDelegationInput): Delegation {
  const opts: CreateDelegationOptions = {
    environment: input.environment,
    from: input.from,
    to: input.to,
    scope: input.scope,
    ...(input.caveats ? { caveats: input.caveats } : {}),
    ...(input.salt ? { salt: input.salt } : {}),
  }
  return createDelegation(opts)
}

export interface RedelegateInput {
  environment: SmartAccountsEnvironment
  from: Hex
  to: Hex
  /** The parent delegation (or its hash) whose authority is being narrowed. */
  parent: Delegation | Hex
  caveats?: Caveats
  salt?: Hex
}

/**
 * A redelegation: `authority = hash(parent)`. The SDK sets the authority for
 * us when `parentDelegation` is supplied. Caveats may only narrow the parent.
 */
export function redelegate(input: RedelegateInput): Delegation {
  const opts: CreateDelegationOptions = {
    environment: input.environment,
    from: input.from,
    to: input.to,
    parentDelegation: input.parent,
    ...(input.caveats ? { caveats: input.caveats } : {}),
    ...(input.salt ? { salt: input.salt } : {}),
  }
  return createDelegation(opts)
}

/** Off-chain EIP-712 hash of a delegation (used as a child's `authority`). */
export function delegationHash(d: Delegation): Hex {
  return hashDelegation(d) as Hex
}

/** A fresh 32-byte salt (delegations must use a unique salt per the relayer). */
export function randomSalt(): Hex {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return `0x${[...bytes].map(b => b.toString(16).padStart(2, '0')).join('')}` as Hex
}
