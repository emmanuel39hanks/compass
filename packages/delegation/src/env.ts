import { getSmartAccountsEnvironment } from '@metamask/smart-accounts-kit'
import type { SmartAccountsEnvironment } from '@metamask/smart-accounts-kit'
import type { Address } from 'viem'

export { getSmartAccountsEnvironment }
export type { SmartAccountsEnvironment }

/**
 * Resolve the DelegationManager address for a chain at runtime. Addresses are
 * deterministic per framework version but MUST NOT be hardcoded — the SDK
 * selects the right version and throws on unsupported chains.
 */
export function resolveDelegationManager(chainId: number): Address {
  return getSmartAccountsEnvironment(chainId).DelegationManager as Address
}
