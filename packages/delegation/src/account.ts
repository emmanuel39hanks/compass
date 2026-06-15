import { Implementation, toMetaMaskSmartAccount } from '@metamask/smart-accounts-kit'
import type { Hex, PublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

/** The operator EOA (viem local account) derived from a private key. */
export function operatorAccount(privateKey: Hex) {
  return privateKeyToAccount(privateKey)
}

export interface AgentAccountOpts {
  privateKey: Hex
  client: PublicClient
  /**
   * '7702' upgrades the EOA in-place (the 1Shot relayer path); 'hybrid' deploys
   * a contract account. Defaults to '7702'.
   */
  implementation?: '7702' | 'hybrid'
}

/**
 * Build a MetaMask smart account for an agent. Defaults to the EIP-7702
 * stateless delegator so the EOA is upgraded in-place (no deployment) — the
 * shape the 1Shot relayer redeems. Param shapes are exercised live by
 * test/local/relay.testnet.ts.
 */
export async function createAgentAccount(opts: AgentAccountOpts) {
  const owner = privateKeyToAccount(opts.privateKey)
  const impl = opts.implementation ?? '7702'
  const params =
    impl === '7702'
      ? {
          client: opts.client,
          implementation: Implementation.Stateless7702,
          address: owner.address,
          signer: { account: owner },
        }
      : {
          client: opts.client,
          implementation: Implementation.Hybrid,
          deployParams: [owner.address, [], [], []],
          deploySalt: '0x' as Hex,
          signer: { account: owner },
        }
  return toMetaMaskSmartAccount(params as Parameters<typeof toMetaMaskSmartAccount>[0])
}
