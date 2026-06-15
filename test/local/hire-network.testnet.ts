/**
 * A2A hire over a REAL network on Base Sepolia. Two agents, two HTTP servers,
 * two ports — the owner discovers the helper, seals a budget grant to its pubkey,
 * and POSTs it over the wire; the helper opens it, redeems on-chain via 1Shot,
 * and replies. Nothing in the middle can read the grant or forge the sender.
 *
 *   bun test/local/hire-network.testnet.ts
 *
 * Env: COMPASS_PRIVATE_KEY (owner, funded with testnet USDC). Optional
 *      PEER_PRIVATE_KEY, HIRE_TO (default: owner), HIRE_AMOUNT (default 0.1).
 */
import { buildAgentCard } from '@compass_agents/delegation'
import {
  type HttpPeer,
  HttpTransport,
  awaitHireResult,
  publicKeyFor,
  sendHire,
  serveAgent,
  serveHire,
} from '@compass_agents/plugin-a2a'
import { RELAYER_TESTNET } from '@compass_agents/relayer-1shot'
import { type Hex, parseUnits } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const ownerKey = process.env.COMPASS_PRIVATE_KEY as Hex | undefined
if (!ownerKey) {
  console.error('set COMPASS_PRIVATE_KEY')
  process.exit(1)
}
const peerKey = (process.env.PEER_PRIVATE_KEY as Hex) ?? generatePrivateKey()
const owner = privateKeyToAccount(ownerKey)
const helper = privateKeyToAccount(peerKey)
const to = (process.env.HIRE_TO as `0x${string}`) ?? owner.address
const amount = process.env.HIRE_AMOUNT ?? '0.1'

// Shared directory: each agent knows the other's endpoint + messaging pubkey.
const peers: Record<string, HttpPeer> = {}
const resolve = (n: string) => peers[n]

const ownerTransport = new HttpTransport({
  selfName: 'owner',
  selfKey: ownerKey,
  resolvePeer: resolve,
})
const helperTransport = new HttpTransport({
  selfName: 'helper',
  selfKey: peerKey,
  resolvePeer: resolve,
})
const ownerSrv = serveAgent({
  transport: ownerTransport,
  card: buildAgentCard({ name: 'owner' }),
  port: 0,
})
const helperSrv = serveAgent({
  transport: helperTransport,
  card: buildAgentCard({ name: 'helper' }),
  port: 0,
})
peers.owner = { name: 'owner', endpoint: ownerSrv.url, pubkey: publicKeyFor(ownerKey) }
peers.helper = { name: 'helper', endpoint: helperSrv.url, pubkey: publicKeyFor(peerKey) }

console.log(`owner   ${owner.address}  @ ${ownerSrv.url}`)
console.log(`helper  ${helper.address}  @ ${helperSrv.url}`)
console.log(`task    send ${amount} USDC to ${to}, within the granted budget\n`)

// Helper: accept hire grants and redeem them on-chain.
serveHire({
  transport: helperTransport,
  self: 'helper',
  peerKey,
  endpoint: RELAYER_TESTNET,
  onResult: ({ result }) =>
    console.log(`helper redeemed → task ${result.taskId} (status ${result.status})`),
})

// Owner: ship the grant over HTTP, await the helper's on-chain result.
const resultP = awaitHireResult(ownerTransport, 'owner', 'helper', 120_000)
console.log('owner → sealing budget grant to helper pubkey, POSTing over HTTP…')
await sendHire({
  transport: ownerTransport,
  from: 'owner',
  to: 'helper',
  helperAccount: helper.address,
  ownerKey,
  task: `send ${amount} USDC to ${to}`,
  recipient: to,
  amount: parseUnits(amount, 6),
  chainId: 84_532,
  endpoint: RELAYER_TESTNET,
})

try {
  const result = await resultP
  const ok = result.status >= 200 && result.status < 300
  console.log(
    `\n${ok ? '✓' : '…'} hire complete over the network — task ${result.taskId} · status ${result.status}${result.hash ? ` · tx ${result.hash}` : ''}`,
  )
} catch (err) {
  console.error(`\nhire failed: ${(err as Error).message}`)
} finally {
  ownerSrv.stop()
  helperSrv.stop()
}
