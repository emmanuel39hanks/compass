/**
 * Live 7702 + 7710 relay via the 1Shot permissionless relayer.
 * Run: `bun test/local/relay.testnet.ts`
 * Requires: COMPASS_PRIVATE_KEY funded with testnet USDC on Base Sepolia.
 * Mainnet: set COMPASS_CHAIN_ID=8453 and COMPASS_RELAYER=mainnet (real USDC).
 *
 * STATUS: LIVE-VERIFIED on Base Sepolia (2026-06-15). Confirmed redemption tx:
 * https://sepolia.basescan.org/tx/0xd30e7efeeb71ecfc9335ebbc993275325fd414f8faa0b2cc0cbe23ce0b3f99cf
 * (status 200, gasUsed 286448, RedeemedDelegation event for rootDelegator
 * 0x83d4…ce13). 7702 upgrade + 7710 redeem, gas paid in testnet USDC.
 */
import {
  erc20PeriodTransfer,
  getSmartAccountsEnvironment,
  randomSalt,
  rootDelegation,
  signDelegation,
} from '@compass_agents/delegation'
import {
  OneShotRelayer,
  RELAYER_MAINNET,
  RELAYER_TESTNET,
  eip7702Implementation,
  feeAmount,
  selectFeeToken,
  toAuthorizationListEntry,
} from '@compass_agents/relayer-1shot'
import { http, type Hex, createPublicClient, encodeFunctionData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base, baseSepolia } from 'viem/chains'

const PK = process.env.COMPASS_PRIVATE_KEY as Hex | undefined
if (!PK) {
  console.error('set COMPASS_PRIVATE_KEY (see .env.example)')
  process.exit(1)
}

const CHAIN_ID = Number(process.env.COMPASS_CHAIN_ID ?? '84532')
const chain = CHAIN_ID === 8453 ? base : baseSepolia
const endpoint = process.env.COMPASS_RELAYER === 'mainnet' ? RELAYER_MAINNET : RELAYER_TESTNET

const ERC20_TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

const env = getSmartAccountsEnvironment(CHAIN_ID)
const owner = privateKeyToAccount(PK)
const client = createPublicClient({ chain, transport: http(process.env.COMPASS_RPC_URL) })
const relayer = new OneShotRelayer({ endpoint })

console.log(`chain=${CHAIN_ID} owner=${owner.address}`)
console.log(`relayer=${endpoint}`)

// 1) Capabilities → fee token + relayer addresses.
const caps = (await relayer.getCapabilities([CHAIN_ID]))[String(CHAIN_ID)]
if (!caps) throw new Error(`relayer has no capabilities for chain ${CHAIN_ID}`)
const usdc = selectFeeToken(caps, 'USDC')
console.log(
  'feeCollector=',
  caps.feeCollector,
  'target=',
  caps.targetAddress,
  'usdc=',
  usdc.address,
)

// 2) EIP-7702 authorization (upgrade the EOA in-place). Confirmed live.
const impl = eip7702Implementation(CHAIN_ID)
const nonce = await client.getTransactionCount({ address: owner.address })
const signedAuth = await owner.signAuthorization({
  contractAddress: impl,
  chainId: CHAIN_ID,
  nonce,
})
const authEntry = toAuthorizationListEntry({
  chainId: CHAIN_ID,
  address: impl,
  nonce,
  r: signedAuth.r,
  s: signedAuth.s,
  yParity: signedAuth.yParity ?? 0,
})
console.log('7702 auth →', impl, 'nonce', nonce)

// 3) Root delegation: owner → relayer target, scoped to a USDC period allowance
//    generous enough to cover the relayer fee.
const decimals = Number(usdc.decimals)
const allowance = BigInt(2) * BigInt(10) ** BigInt(decimals) // 2 USDC headroom
const unsigned = rootDelegation({
  environment: env,
  from: owner.address,
  to: caps.targetAddress,
  scope: erc20PeriodTransfer({
    tokenAddress: usdc.address,
    periodAmount: allowance,
    periodDuration: 86_400,
    startDate: 1_700_000_000,
  }),
  salt: randomSalt(),
})
const signature = await signDelegation({
  privateKey: PK,
  delegation: unsigned,
  delegationManager: env.DelegationManager as Hex,
  chainId: CHAIN_ID,
})
const delegation = { ...unsigned, signature }
const permissionContext = [delegation]

// 4) Estimate to learn the exact USDC fee, then build the fee transfer execution. Confirmed live.
const probeFee = BigInt(10) ** BigInt(decimals) / 2n // 0.5 USDC probe (>= minFee in practice)
const feeExecution = (amount: bigint) => ({
  target: usdc.address,
  value: '0',
  data: encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [caps.feeCollector, amount],
  }) as Hex,
})

const estimate = await relayer.estimate7710({
  chainId: CHAIN_ID,
  permissionContext,
  executions: [feeExecution(probeFee)],
  authorizationList: [authEntry],
})
const required = estimate.requiredPaymentAmount ? BigInt(estimate.requiredPaymentAmount) : probeFee
const fee = feeAmount(required, probeFee)
console.log('estimated fee (USDC base units):', fee.toString())

// 5) Send: fee transfer (covers gas) is the only execution in this smoke test.
const taskId = await relayer.send7710({
  chainId: CHAIN_ID,
  permissionContext,
  executions: [feeExecution(fee)],
  authorizationList: [authEntry],
  context: estimate.context,
  memo: 'compass-relay-smoke',
})
console.log('TaskId:', taskId)

// 6) Poll status to a terminal state.
for (let i = 0; i < 30; i++) {
  const status = await relayer.getStatus(taskId, true)
  console.log(`status[${i}]:`, status.status, status.hash ?? status.message ?? '')
  if (status.status >= 200) break
  await new Promise(r => setTimeout(r, 3000))
}
