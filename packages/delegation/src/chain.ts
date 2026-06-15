import { ROOT_AUTHORITY } from '@metamask/smart-accounts-kit'
import type { Delegation } from '@metamask/smart-accounts-kit'
import { delegationHash } from './delegation'

/**
 * Assemble a leaf-first delegation chain `[leaf, …, root]` and validate that
 * each link's `authority` is the hash of its parent and the parties connect.
 * This is the data a delegate submits to `redeemDelegations`.
 */
export function linkChain(leaf: Delegation, ...ancestors: Delegation[]): Delegation[] {
  const chain = [leaf, ...ancestors]
  assertChainLinks(chain)
  return chain
}

/** Throws if the chain is not a valid leaf→root authority chain. */
export function assertChainLinks(chain: Delegation[]): void {
  if (chain.length === 0) throw new Error('empty delegation chain')

  const root = chain[chain.length - 1]
  if (!root) throw new Error('empty delegation chain')
  if (root.authority.toLowerCase() !== ROOT_AUTHORITY.toLowerCase()) {
    throw new Error('chain root must carry ROOT_AUTHORITY')
  }

  for (let i = 0; i < chain.length - 1; i++) {
    const child = chain[i]
    const parent = chain[i + 1]
    if (!child || !parent) continue
    const expected = delegationHash(parent).toLowerCase()
    if (child.authority.toLowerCase() !== expected) {
      throw new Error(`broken link at index ${i}: authority is not hash(parent)`)
    }
    if (child.delegator.toLowerCase() !== parent.delegate.toLowerCase()) {
      throw new Error(`broken link at index ${i}: delegator is not parent.delegate`)
    }
  }
}
