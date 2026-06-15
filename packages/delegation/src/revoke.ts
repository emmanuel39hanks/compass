import type { Delegation } from '@metamask/smart-accounts-kit'
import { http, type Hex, createPublicClient, createWalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base, baseSepolia } from 'viem/chains'
import { getSmartAccountsEnvironment } from './env'
import { encodeDisable } from './redeem'

function chainFor(chainId: number) {
  if (chainId === 8453) return base
  if (chainId === 84_532) return baseSepolia
  throw new Error(`revoke: unsupported chain ${chainId}`)
}

export interface RevokeOpts {
  /** The delegator's key (only the delegator may disable its own delegation). */
  ownerKey: Hex
  /** The delegation to disable on-chain. */
  delegation: Delegation
  chainId: number
  rpcUrl?: string
}

/**
 * Revoke a delegation on-chain: the delegator calls `DelegationManager.
 * disableDelegation`, after which any redeem of a chain rooted at it reverts.
 * Costs ETH gas (a plain delegator-signed tx), not a relayed redemption.
 */
export async function revokeDelegation(opts: RevokeOpts): Promise<{ hash: Hex }> {
  const env = getSmartAccountsEnvironment(opts.chainId)
  const chain = chainFor(opts.chainId)
  const account = privateKeyToAccount(opts.ownerKey)
  const wallet = createWalletClient({ account, chain, transport: http(opts.rpcUrl) })
  const pub = createPublicClient({ chain, transport: http(opts.rpcUrl) })
  const hash = await wallet.sendTransaction({
    to: env.DelegationManager as Hex,
    data: encodeDisable(opts.delegation),
  })
  await pub.waitForTransactionReceipt({ hash })
  return { hash }
}
