import { getSmartAccountsEnvironment } from '@compass_agents/delegation'
import type { Hex } from 'viem'
import type { AuthorizationListEntry } from './types'

/** viem's `signAuthorization` return shape (the fields we need). */
export interface SignedAuthorization {
  chainId: number
  address: Hex
  nonce: number
  r: Hex
  s: Hex
  yParity: number
}

/** Normalize a signed 7702 authorization into the relayer's wire entry. */
export function toAuthorizationListEntry(a: SignedAuthorization): AuthorizationListEntry {
  return {
    address: a.address,
    chainId: String(a.chainId),
    nonce: String(a.nonce),
    r: a.r,
    s: a.s,
    yParity: String(a.yParity),
  }
}

/**
 * Resolve the EIP-7702 stateless delegator implementation address for a chain.
 * This is the contract an EOA's code points at after the 7702 upgrade — what
 * `signAuthorization` should target. Resolved at runtime; never hardcoded.
 */
export function eip7702Implementation(chainId: number): Hex {
  const env = getSmartAccountsEnvironment(chainId)
  const key = Object.keys(env.implementations).find(k => /7702/i.test(k))
  const impl = key ? env.implementations[key] : undefined
  if (!impl) throw new Error(`no EIP-7702 implementation registered for chain ${chainId}`)
  return impl as Hex
}
