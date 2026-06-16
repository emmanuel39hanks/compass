import type { Address, Hex, PublicClient, WalletClient } from 'viem'

/**
 * ERC-8004 Reputation + Validation registries — the trust layer on top of the
 * identity registry. Clients leave on-chain feedback for an agent, and validators
 * attest to its work, so an agent can check a peer's reputation before hiring it.
 *
 * Addresses are empty until the registries are deployed for a chain; the tools
 * fall back to identity-only and never throw on a missing registry.
 */
export const REPUTATION_REGISTRY: Record<number, Address> = {}
export const VALIDATION_REGISTRY: Record<number, Address> = {}

const ZERO_HASH = `0x${'0'.repeat(64)}` as Hex

export const REPUTATION_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'giveFeedback',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'value', type: 'int128' },
      { name: 'valueDecimals', type: 'uint8' },
      { name: 'tag1', type: 'string' },
      { name: 'tag2', type: 'string' },
      { name: 'endpoint', type: 'string' },
      { name: 'feedbackURI', type: 'string' },
      { name: 'feedbackHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getSummary',
    stateMutability: 'view',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddresses', type: 'address[]' },
      { name: 'tag1', type: 'string' },
      { name: 'tag2', type: 'string' },
    ],
    outputs: [
      { name: 'count', type: 'uint64' },
      { name: 'summaryValue', type: 'int128' },
      { name: 'summaryValueDecimals', type: 'uint8' },
    ],
  },
] as const

export const VALIDATION_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'validationRequest',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'validatorAddress', type: 'address' },
      { name: 'agentId', type: 'uint256' },
      { name: 'requestURI', type: 'string' },
      { name: 'requestHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getSummary',
    stateMutability: 'view',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'validatorAddresses', type: 'address[]' },
      { name: 'tag', type: 'string' },
    ],
    outputs: [
      { name: 'count', type: 'uint64' },
      { name: 'averageResponse', type: 'uint8' },
    ],
  },
] as const

export interface ReputationSummary {
  count: number
  /** Average score, scaled out of `valueDecimals` (e.g. value=950 decimals=1 → 95). */
  score: number
  raw: { value: bigint; decimals: number }
}

/** Turn the registry's (count, value, decimals) tuple into a readable summary. */
export function normalizeReputation(
  count: bigint,
  value: bigint,
  decimals: number,
): ReputationSummary {
  const denom = 10 ** decimals
  return {
    count: Number(count),
    score: denom > 0 ? Number(value) / denom : Number(value),
    raw: { value, decimals },
  }
}

/** Read an agent's aggregate reputation from the ERC-8004 ReputationRegistry. */
export async function readReputation(opts: {
  client: PublicClient
  registry: Address
  agentId: bigint
  clients?: Address[]
  tag1?: string
  tag2?: string
}): Promise<ReputationSummary> {
  const [count, value, decimals] = (await opts.client.readContract({
    address: opts.registry,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: 'getSummary',
    args: [opts.agentId, opts.clients ?? [], opts.tag1 ?? '', opts.tag2 ?? ''],
  })) as readonly [bigint, bigint, number]
  return normalizeReputation(count, value, decimals)
}

/** Leave on-chain feedback for an agent (ERC-8004 giveFeedback). */
export async function submitFeedback(opts: {
  walletClient: WalletClient
  publicClient: PublicClient
  registry: Address
  agentId: bigint
  /** Score (e.g. 0..100), interpreted with `valueDecimals`. */
  value: bigint
  valueDecimals?: number
  tag1?: string
  tag2?: string
  endpoint?: string
  feedbackURI?: string
  feedbackHash?: Hex
}): Promise<{ txHash: Hex }> {
  const account = opts.walletClient.account
  if (!account) throw new Error('walletClient has no account')
  const sim = await opts.publicClient.simulateContract({
    account,
    address: opts.registry,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: 'giveFeedback',
    args: [
      opts.agentId,
      opts.value,
      opts.valueDecimals ?? 0,
      opts.tag1 ?? '',
      opts.tag2 ?? '',
      opts.endpoint ?? '',
      opts.feedbackURI ?? '',
      opts.feedbackHash ?? ZERO_HASH,
    ],
  })
  const txHash = await opts.walletClient.writeContract(sim.request)
  await opts.publicClient.waitForTransactionReceipt({ hash: txHash })
  return { txHash }
}

/** Read an agent's validation summary (ERC-8004 ValidationRegistry). */
export async function readValidationSummary(opts: {
  client: PublicClient
  registry: Address
  agentId: bigint
  validators?: Address[]
  tag?: string
}): Promise<{ count: number; averageResponse: number }> {
  const [count, avg] = (await opts.client.readContract({
    address: opts.registry,
    abi: VALIDATION_REGISTRY_ABI,
    functionName: 'getSummary',
    args: [opts.agentId, opts.validators ?? [], opts.tag ?? ''],
  })) as readonly [bigint, number]
  return { count: Number(count), averageResponse: avg }
}
