/**
 * Mint a compass agent identity NFT on Base Sepolia. Run:
 *   bun test/local/register.testnet.ts
 * Env: COMPASS_PRIVATE_KEY (needs a little Base Sepolia ETH for the mint gas).
 *      AGENT_NAME (optional, default "scout").
 */
import { COMPASS_AGENT_REGISTRY, registerAgent, resolveAgent } from '@compass_agents/delegation'
import { http, type Hex, createPublicClient, createWalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

const pk = process.env.COMPASS_PRIVATE_KEY as Hex | undefined
if (!pk) {
  console.error('set COMPASS_PRIVATE_KEY')
  process.exit(1)
}

const account = privateKeyToAccount(pk)
const registry = COMPASS_AGENT_REGISTRY[84_532]
if (!registry) throw new Error('no registry deployed for Base Sepolia')
const name = process.env.AGENT_NAME ?? 'scout'

const publicClient = createPublicClient({ chain: baseSepolia, transport: http() })
const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http() })

console.log(`registering "${name}" on Base Sepolia (owner ${account.address})…`)
const { agentId, txHash } = await registerAgent({
  walletClient,
  publicClient,
  registry,
  owner: account.address,
  name,
  agentCardURI: `https://compass.app/a/${name}`,
  agentAccount: account.address,
  pubkey: '0x',
})
console.log(`✓ minted agentId ${agentId} · tx ${txHash}`)

const r = await resolveAgent(publicClient, registry, name)
console.log(`resolve("${name}") → agentId ${r.agentId}, owner ${r.owner}`)
