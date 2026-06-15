/**
 * A2A hire on Base Sepolia: the owner hands a narrowed USDC budget to a peer
 * agent (redelegation); the peer redeems it on-chain via 1Shot. The transfer
 * executes as the owner, bounded by the budget. Run:
 *   bun test/local/hire.testnet.ts
 * Env: COMPASS_PRIVATE_KEY (owner, needs USDC). Optional PEER_PRIVATE_KEY,
 *      HIRE_TO (default: self), HIRE_AMOUNT (default 0.1).
 */
import { relayHiredUsdcTransfer } from '@compass_agents/relayer-1shot'
import { type Hex, parseUnits } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const ownerKey = process.env.COMPASS_PRIVATE_KEY as Hex | undefined
if (!ownerKey) {
  console.error('set COMPASS_PRIVATE_KEY')
  process.exit(1)
}
const peerKey = (process.env.PEER_PRIVATE_KEY as Hex) ?? generatePrivateKey()
const owner = privateKeyToAccount(ownerKey)
const peer = privateKeyToAccount(peerKey)
const to = (process.env.HIRE_TO as `0x${string}`) ?? owner.address
const amountStr = process.env.HIRE_AMOUNT ?? '0.1'

console.log(`owner   ${owner.address}`)
console.log(`hires → ${peer.address} (the helper agent)`)
console.log(`task    move ${amountStr} USDC to ${to}, within the budget\n`)

const res = await relayHiredUsdcTransfer({
  ownerKey,
  peerKey,
  chainId: 84_532,
  endpoint: 'https://relayer.1shotapi.dev/relayers',
  to,
  amount: parseUnits(amountStr, 6),
})
console.log(`taskId ${res.taskId} · status ${res.status}${res.hash ? ` · tx ${res.hash}` : ''}`)
