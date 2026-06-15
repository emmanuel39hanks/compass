import type { CompassConfig, ToolDef } from '@compass_agents/core'
import {
  USDC_BY_CHAIN,
  createBudgetDelegation,
  getSmartAccountsEnvironment,
  operatorAccount,
  randomSalt,
  signDelegation,
} from '@compass_agents/delegation'
import { makeHireTools } from '@compass_agents/plugin-a2a'
import {
  OneShotRelayer,
  readErc20Balance,
  relayHiredUsdcTransfer,
  relayUsdcTransfer,
} from '@compass_agents/relayer-1shot'
import { type FetchImpl, payFetch } from '@compass_agents/x402'
import { type Hex, concatHex, keccak256, stringToHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { z } from 'zod'
import { makeOnchainTools } from './onchain'

const DEFAULT_RELAYER = 'https://relayer.1shotapi.dev/relayers'

/**
 * The agent's on-chain tool surface (balance, send, hire), wired to the live
 * relayer. Shared by the chat REPL and the gateway so both drive the same
 * capabilities. Returns [] when the chain has no known USDC.
 */
export function buildOnchainTools(config: CompassConfig, pk: Hex): ToolDef[] {
  const account = operatorAccount(pk).address
  const chainId = config.network.chainId
  const token = USDC_BY_CHAIN[chainId]
  if (!token) return []
  const endpoint = config.relayer?.endpoint ?? DEFAULT_RELAYER
  const rpcUrl = config.network.rpcUrl

  // A deterministic helper sub-agent the owner controls (derived from the owner
  // key) — so `a2a.hire` performs a real owner→helper→redeem chain.
  const helperKey = keccak256(concatHex([pk, stringToHex('compass-helper-v1')]))
  const helperAccount = privateKeyToAccount(helperKey).address

  const tools: ToolDef[] = [
    ...makeOnchainTools({
      account,
      readUsdcBalance: () => readErc20Balance({ chainId, rpcUrl, token, account }),
      sendUsdc: (to, amount) =>
        relayUsdcTransfer({ privateKey: pk, chainId, rpcUrl, endpoint, to, amount }),
    }),
    ...makeHireTools({
      hire: async ({ to, amount, helper }) => {
        const res = await relayHiredUsdcTransfer({
          ownerKey: pk,
          peerKey: helperKey,
          chainId,
          rpcUrl,
          endpoint,
          to,
          amount,
        })
        return { ...res, helper: helper ?? `helper ${helperAccount.slice(0, 8)}…` }
      },
    }),
  ]

  // When a budget is configured, the agent can pay x402 paywalls from it: it
  // presents a budget-scoped delegation (owner → 1Shot redeemer); the seller's
  // facilitator settles by redeeming it. Lazily built (needs the relayer target).
  if (config.budget) {
    const budget = config.budget
    let cachedPay: FetchImpl | undefined
    const getPay = async (): Promise<FetchImpl> => {
      if (cachedPay) return cachedPay
      const env = getSmartAccountsEnvironment(chainId)
      const caps = (await new OneShotRelayer({ endpoint }).getCapabilities([chainId]))[
        String(chainId)
      ]
      if (!caps) throw new Error(`relayer has no capabilities for chain ${chainId}`)
      const unsigned = createBudgetDelegation({
        environment: env,
        owner: account,
        agent: caps.targetAddress,
        spec: { token: budget.token, amount: budget.amount, period: budget.period },
        chainId,
        startDate: 1_700_000_000,
        salt: randomSalt(),
      })
      const signature = await signDelegation({
        privateKey: pk,
        delegation: unsigned,
        delegationManager: env.DelegationManager as Hex,
        chainId,
      })
      cachedPay = payFetch({
        delegationManager: env.DelegationManager as Hex,
        permissionContext: [{ ...unsigned, signature }],
        delegator: account,
      })
      return cachedPay
    }
    const pay: ToolDef<{ url: string }> = {
      name: 'pay',
      description:
        'Fetch a paid (x402) resource, paying from your budget if a paywall is hit. ' +
        'Use for buying data/compute on demand. Spends your delegated allowance, not your own funds.',
      dangerous: true,
      schema: z.object({ url: z.string().url() }),
      run: async args => {
        const res = await (await getPay())(args.url)
        if (res.status === 402)
          return { content: 'payment was not accepted by the seller', ok: false }
        const body = await res.text()
        return { content: res.ok ? body : `request failed: HTTP ${res.status}`, ok: res.ok }
      },
    }
    tools.push(pay)
  }

  return tools
}
