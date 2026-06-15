/**
 * @compass_agents/delegation — MetaMask Smart Accounts Kit wrapper (ERC-7710/7715).
 *
 * Typed surface over @metamask/smart-accounts-kit@^1.6: smart accounts, root
 * delegations, redelegations, chain assembly/validation, redeem/disable
 * encoding, and scope factories. The A2A trust primitive.
 * See docs/INTEGRATIONS.md#metamask.
 */
export const PACKAGE = '@compass_agents/delegation' as const
export const ROLE = 'erc-7710 delegation core' as const

export * from './env'
export * from './scopes'
export * from './delegation'
export * from './chain'
export * from './redeem'
export * from './revoke'
export * from './account'
export * from './budget'
export * from './identity'

// SDK essentials re-exported so consumers depend only on @compass_agents/delegation.
export {
  Implementation,
  toMetaMaskSmartAccount,
  createDelegation,
  createOpenDelegation,
  signDelegation,
  createExecution,
  ScopeType,
  CaveatType,
  ANY_BENEFICIARY,
} from '@metamask/smart-accounts-kit'
export type {
  Caveat,
  Caveats,
  CreateDelegationOptions,
  PermissionContext,
  MetaMaskSmartAccount,
} from '@metamask/smart-accounts-kit'
