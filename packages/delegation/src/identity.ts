import type { Address, Hex, PublicClient, WalletClient } from 'viem'

/** Deployed CompassAgentRegistry (ERC-8004-shaped agent identity NFT) by chain. */
export const COMPASS_AGENT_REGISTRY: Record<number, Address> = {
  84532: '0x5eDc156Ef946261D9c66ECC17218952D77BFE650', // Base Sepolia
}

export const AGENT_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'register',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'agentCardURI', type: 'string' },
      { name: 'agentAccount', type: 'address' },
      { name: 'pubkey', type: 'bytes' },
    ],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'resolve',
    stateMutability: 'view',
    inputs: [{ name: 'name', type: 'string' }],
    outputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'owner', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'records',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      { name: 'agentAccount', type: 'address' },
      { name: 'pubkey', type: 'bytes' },
      { name: 'agentCardURI', type: 'string' },
    ],
  },
  {
    type: 'function',
    name: 'totalAgents',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

export interface AgentSkill {
  id: string
  name: string
  description: string
  tags: string[]
}

/** A2A AgentCard (v0.3.0 subset) — the agent's public "business card". */
export interface AgentCard {
  protocolVersion: string
  name: string
  description: string
  url: string
  version: string
  provider: { organization: string }
  capabilities: { streaming: boolean }
  skills: AgentSkill[]
}

export function buildAgentCard(opts: {
  name: string
  description?: string
  url?: string
  skills?: AgentSkill[]
}): AgentCard {
  return {
    protocolVersion: '0.3.0',
    name: opts.name,
    description:
      opts.description ?? `compass agent "${opts.name}" — acts on-chain within revocable limits`,
    url: opts.url ?? `https://compass.app/a/${opts.name}`,
    version: '0.1.0',
    provider: { organization: 'compass' },
    capabilities: { streaming: false },
    skills: opts.skills ?? [
      {
        id: 'spend',
        name: 'Spend within budget',
        description: 'Execute on-chain actions within an approved, revocable budget',
        tags: ['onchain', 'payments'],
      },
      {
        id: 'hire',
        name: 'Hire helper agents',
        description: 'Hand a narrowed slice of authority to other agents',
        tags: ['a2a', 'delegation'],
      },
    ],
  }
}

/** Resolve a handle to its agent id + current owner (on-chain). */
export async function resolveAgent(
  client: PublicClient,
  registry: Address,
  name: string,
): Promise<{ agentId: bigint; owner: Address }> {
  const [agentId, owner] = (await client.readContract({
    address: registry,
    abi: AGENT_REGISTRY_ABI,
    functionName: 'resolve',
    args: [name],
  })) as readonly [bigint, Address]
  return { agentId, owner }
}

export interface AgentRecord {
  agentAccount: Address
  pubkey: Hex
  agentCardURI: string
}

/** Read an agent's on-chain record (account, pubkey, card URI). */
export async function readAgentRecord(
  client: PublicClient,
  registry: Address,
  agentId: bigint,
): Promise<AgentRecord> {
  const [agentAccount, pubkey, agentCardURI] = (await client.readContract({
    address: registry,
    abi: AGENT_REGISTRY_ABI,
    functionName: 'records',
    args: [agentId],
  })) as readonly [Address, Hex, string]
  return { agentAccount, pubkey, agentCardURI }
}

export interface Peer extends AgentRecord {
  agentId: bigint
  owner: Address
}

/** Discover a peer agent by handle: resolve + read its record. */
export async function discoverPeer(
  client: PublicClient,
  registry: Address,
  name: string,
): Promise<Peer> {
  const { agentId, owner } = await resolveAgent(client, registry, name)
  if (agentId === 0n) throw new Error(`no agent named "${name}"`)
  const record = await readAgentRecord(client, registry, agentId)
  return { agentId, owner, ...record }
}

export interface RegisterAgentOpts {
  walletClient: WalletClient
  publicClient: PublicClient
  registry: Address
  owner: Address
  name: string
  agentCardURI: string
  agentAccount: Address
  pubkey: Hex
}

/** Mint an agent identity NFT on-chain. Returns the agentId + tx hash. */
export async function registerAgent(
  opts: RegisterAgentOpts,
): Promise<{ agentId: bigint; txHash: Hex }> {
  const account = opts.walletClient.account
  if (!account) throw new Error('walletClient has no account')
  const sim = await opts.publicClient.simulateContract({
    account,
    address: opts.registry,
    abi: AGENT_REGISTRY_ABI,
    functionName: 'register',
    args: [opts.owner, opts.name, opts.agentCardURI, opts.agentAccount, opts.pubkey],
  })
  const txHash = await opts.walletClient.writeContract(sim.request)
  await opts.publicClient.waitForTransactionReceipt({ hash: txHash })
  return { agentId: sim.result as bigint, txHash }
}
