import type { CompassConfigInput } from '@compass_agents/core'
import { parseBudget } from '@compass_agents/delegation'

export const NETWORKS = {
  'base-sepolia': { chainId: 84_532, rpcUrl: 'https://sepolia.base.org', name: 'Base Sepolia' },
  base: { chainId: 8_453, rpcUrl: 'https://mainnet.base.org', name: 'Base' },
} as const
export type NetworkKey = keyof typeof NETWORKS

const RELAYER = {
  'base-sepolia': 'https://relayer.1shotapi.dev/relayers',
  base: 'https://relayer.1shotapi.com/relayers',
} as const

export interface InitOptions {
  network?: NetworkKey
  signerSource?: CompassConfigInput['identity']['signerSource']
  /** e.g. "25 USDC/week" */
  budget?: string
  agentName?: string
  smartAccount?: string
  agentId?: string
  keystorePath?: string
}

/** Turn init choices into a validated compass config (pure; no IO). */
export function buildInitConfig(opts: InitOptions): CompassConfigInput {
  const networkKey: NetworkKey =
    opts.network && opts.network in NETWORKS ? opts.network : 'base-sepolia'
  const net = NETWORKS[networkKey]
  const config: CompassConfigInput = {
    identity: {
      signerSource: opts.signerSource ?? 'privkey',
      ...(opts.agentName ? { agentName: opts.agentName } : {}),
      ...(opts.smartAccount ? { smartAccount: opts.smartAccount } : {}),
      ...(opts.agentId ? { agentId: opts.agentId } : {}),
      ...(opts.keystorePath ? { keystorePath: opts.keystorePath } : {}),
    },
    network: { name: net.name, chainId: net.chainId, rpcUrl: net.rpcUrl },
    brain: {},
    relayer: { endpoint: RELAYER[networkKey] },
    approvals: { mode: 'prompt' },
    plugins: ['a2a'],
  }
  if (opts.budget) {
    const b = parseBudget(opts.budget)
    config.budget = { token: b.token, amount: b.amount, period: b.period }
  }
  return config
}

/**
 * Upsert `KEY=value` pairs into the text of a `.env` file: replace a key in place
 * if present, append it otherwise. Bun auto-loads `.env` from the working dir, so
 * writing the operator key + Venice key here means `compass` just works after init.
 */
export function upsertEnv(envText: string, kv: Record<string, string>): string {
  let out = envText
  for (const [k, v] of Object.entries(kv)) {
    const line = `${k}=${v}`
    const re = new RegExp(`^${k}=.*$`, 'm')
    if (re.test(out)) {
      out = out.replace(re, line)
    } else {
      if (out.length > 0 && !out.endsWith('\n')) out += '\n'
      out += `${line}\n`
    }
  }
  return out
}
