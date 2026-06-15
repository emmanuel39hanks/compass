import {
  type Delegation,
  type SmartAccountsEnvironment,
  getSmartAccountsEnvironment,
  randomSalt,
  redelegate,
  rootDelegation,
  signDelegation,
} from '@compass_agents/delegation'
import { erc20PeriodTransfer } from '@compass_agents/delegation'
import { http, type Address, type Hex, createPublicClient, encodeFunctionData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base, baseSepolia } from 'viem/chains'
import { eip7702Implementation, toAuthorizationListEntry } from './auth-7702'
import { OneShotRelayer } from './client'
import { feeAmount, selectFeeToken } from './fee'
import type { AuthorizationListEntry, RelayerExecution } from './types'

const ERC20_ABI = [
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
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

/** Pure: an ERC-20 transfer execution for the relayer bundle. */
export function erc20TransferExecution(
  token: Address,
  to: Address,
  amount: bigint,
): RelayerExecution {
  return {
    target: token,
    value: '0',
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [to, amount],
    }) as Hex,
  }
}

function chainFor(chainId: number) {
  if (chainId === 8453) return base
  if (chainId === 84_532) return baseSepolia
  return undefined
}

/** Read an ERC-20 balance (no tx). */
export async function readErc20Balance(opts: {
  chainId: number
  rpcUrl?: string
  token: Address
  account: Address
}): Promise<bigint> {
  const client = createPublicClient({ chain: chainFor(opts.chainId), transport: http(opts.rpcUrl) })
  return client.readContract({
    address: opts.token,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [opts.account],
  })
}

export interface RelayTransferOpts {
  privateKey: Hex
  chainId: number
  rpcUrl?: string
  endpoint: string
  /** Recipient + amount (token base units). Token defaults to the relayer's USDC. */
  to: Address
  amount: bigint
  environment?: SmartAccountsEnvironment
}

export interface RelayResult {
  taskId: Hex
  status: number
  hash?: Hex
}

/** Sign a 7702 authorization for `account` to run the delegator implementation. */
async function authorizeExecutor(
  account: ReturnType<typeof privateKeyToAccount>,
  chainId: number,
  client: { getTransactionCount: (args: { address: Address }) => Promise<number> },
): Promise<AuthorizationListEntry> {
  const impl = eip7702Implementation(chainId)
  const nonce = await client.getTransactionCount({ address: account.address })
  const auth = await account.signAuthorization({ contractAddress: impl, chainId, nonce })
  return toAuthorizationListEntry({
    chainId,
    address: impl,
    nonce,
    r: auth.r,
    s: auth.s,
    yParity: auth.yParity ?? 0,
  })
}

/**
 * Shared redeem path: estimate the USDC fee, then submit (fee + work) executions
 * with the given delegation chain + 7702 authorization, and poll to confirmation.
 */
async function submitUsdcWork(opts: {
  relayer: OneShotRelayer
  chainId: number
  feeCollector: Address
  token: Address
  decimals: number
  permissionContext: Delegation[]
  authEntry: AuthorizationListEntry
  to: Address
  amount: bigint
  memo: string
}): Promise<RelayResult> {
  const probeFee = 10n ** BigInt(opts.decimals) / 2n // 0.5 USDC probe
  const feeExec = (amt: bigint) => erc20TransferExecution(opts.token, opts.feeCollector, amt)
  const workExec = erc20TransferExecution(opts.token, opts.to, opts.amount)

  const estimate = await opts.relayer.estimate7710({
    chainId: opts.chainId,
    permissionContext: opts.permissionContext,
    executions: [feeExec(probeFee), workExec],
    authorizationList: [opts.authEntry],
  })
  const required = estimate.requiredPaymentAmount
    ? BigInt(estimate.requiredPaymentAmount)
    : probeFee
  const fee = feeAmount(required, probeFee)

  const taskId = await opts.relayer.send7710({
    chainId: opts.chainId,
    permissionContext: opts.permissionContext,
    executions: [feeExec(fee), workExec],
    authorizationList: [opts.authEntry],
    context: estimate.context,
    memo: opts.memo,
  })

  let status = 100
  let hash: Hex | undefined
  for (let i = 0; i < 30; i++) {
    const s = await opts.relayer.getStatus(taskId, false)
    status = s.status
    if (s.hash) hash = s.hash
    if (status >= 200) break
    await new Promise(r => setTimeout(r, 3000))
  }
  return { taskId, status, ...(hash ? { hash } : {}) }
}

/**
 * Execute a USDC transfer through the 1Shot permissionless relayer: 7702 upgrade
 * + a delegation to the relayer's target scoped to (fee + transfer), gas paid in
 * USDC. Mirrors the proven testnet relay flow (the confirmed Base Sepolia tx).
 */
export async function relayUsdcTransfer(opts: RelayTransferOpts): Promise<RelayResult> {
  const env = opts.environment ?? getSmartAccountsEnvironment(opts.chainId)
  const owner = privateKeyToAccount(opts.privateKey)
  const client = createPublicClient({ chain: chainFor(opts.chainId), transport: http(opts.rpcUrl) })
  const relayer = new OneShotRelayer({ endpoint: opts.endpoint })

  const caps = (await relayer.getCapabilities([opts.chainId]))[String(opts.chainId)]
  if (!caps) throw new Error(`relayer has no capabilities for chain ${opts.chainId}`)
  const usdc = selectFeeToken(caps, 'USDC')
  const decimals = Number(usdc.decimals)

  const authEntry = await authorizeExecutor(owner, opts.chainId, client)

  // Allow the transfer amount plus ~1 USDC headroom for the gas fee.
  const allowance = opts.amount + 10n ** BigInt(decimals)
  const unsigned = rootDelegation({
    environment: env,
    from: owner.address,
    to: caps.targetAddress,
    salt: randomSalt(),
    scope: erc20PeriodTransfer({
      tokenAddress: usdc.address,
      periodAmount: allowance,
      periodDuration: 86_400,
      startDate: 1_700_000_000,
    }),
  })
  const signature = await signDelegation({
    privateKey: opts.privateKey,
    delegation: unsigned,
    delegationManager: env.DelegationManager as Hex,
    chainId: opts.chainId,
  })

  return submitUsdcWork({
    relayer,
    chainId: opts.chainId,
    feeCollector: caps.feeCollector,
    token: usdc.address,
    decimals,
    permissionContext: [{ ...unsigned, signature }],
    authEntry,
    to: opts.to,
    amount: opts.amount,
    memo: 'compass-send',
  })
}

/**
 * A signed hire grant — the OWNER's half of an A2A hire, JSON-safe so it can ride
 * any transport (HTTP, inbox) to the helper. It carries everything the helper
 * needs to redeem on-chain *as the owner*, bounded by the budget: the signed root
 * delegation owner→helper, the owner's 7702 authorization, and the work.
 */
export interface HireGrant {
  /** Signed root delegation owner → helper account (scoped to a USDC budget). */
  root: Delegation
  /** Owner's signed 7702 authorization (owner is the executing account). */
  authorization: AuthorizationListEntry
  /** Recipient of the USDC. */
  to: Address
  /** Amount in token base units, as a string (JSON-safe). */
  amount: string
  chainId: number
  /** USDC token the grant is scoped to. */
  token: Address
}

export interface HireGrantOpts {
  /** Owner key — the executing account (7702-upgraded), whose USDC moves. */
  ownerKey: Hex
  /** The helper agent's account (the delegate of the budget). */
  peerAccount: Address
  chainId: number
  rpcUrl?: string
  endpoint: string
  to: Address
  amount: bigint
  environment?: SmartAccountsEnvironment
}

/**
 * Owner side of a hire: sign a 7702 authorization + a budget-scoped root
 * delegation owner→helper. Returns a JSON-safe {@link HireGrant} to ship to the
 * helper. The owner never touches the relayer — it only hands over bounded authority.
 */
export async function hireGrantFromOwner(opts: HireGrantOpts): Promise<HireGrant> {
  const env = opts.environment ?? getSmartAccountsEnvironment(opts.chainId)
  const owner = privateKeyToAccount(opts.ownerKey)
  const client = createPublicClient({ chain: chainFor(opts.chainId), transport: http(opts.rpcUrl) })
  const relayer = new OneShotRelayer({ endpoint: opts.endpoint })

  const caps = (await relayer.getCapabilities([opts.chainId]))[String(opts.chainId)]
  if (!caps) throw new Error(`relayer has no capabilities for chain ${opts.chainId}`)
  const usdc = selectFeeToken(caps, 'USDC')
  const decimals = Number(usdc.decimals)

  const authorization = await authorizeExecutor(owner, opts.chainId, client)

  // Budget covers the transfer plus ~1 USDC of fee headroom.
  const allowance = opts.amount + 10n ** BigInt(decimals)
  const rootUnsigned = rootDelegation({
    environment: env,
    from: owner.address,
    to: opts.peerAccount,
    salt: randomSalt(),
    scope: erc20PeriodTransfer({
      tokenAddress: usdc.address,
      periodAmount: allowance,
      periodDuration: 86_400,
      startDate: 1_700_000_000,
    }),
  })
  const rootSig = await signDelegation({
    privateKey: opts.ownerKey,
    delegation: rootUnsigned,
    delegationManager: env.DelegationManager as Hex,
    chainId: opts.chainId,
  })

  return {
    root: { ...rootUnsigned, signature: rootSig },
    authorization,
    to: opts.to,
    amount: opts.amount.toString(),
    chainId: opts.chainId,
    token: usdc.address,
  }
}

export interface HireRedeemOpts {
  /** Helper (hired agent) key — redelegates onward and redeems. */
  peerKey: Hex
  grant: HireGrant
  rpcUrl?: string
  endpoint: string
  environment?: SmartAccountsEnvironment
}

/**
 * Helper side of a hire: accept a {@link HireGrant}, redelegate the budget onward
 * to the 1Shot target, and redeem on-chain. The transfer executes as the OWNER,
 * bounded by the owner's budget caveat — the helper can never exceed it.
 */
export async function hireRedeemAsPeer(opts: HireRedeemOpts): Promise<RelayResult> {
  const { grant } = opts
  const env = opts.environment ?? getSmartAccountsEnvironment(grant.chainId)
  const peer = privateKeyToAccount(opts.peerKey)
  const relayer = new OneShotRelayer({ endpoint: opts.endpoint })

  const caps = (await relayer.getCapabilities([grant.chainId]))[String(grant.chainId)]
  if (!caps) throw new Error(`relayer has no capabilities for chain ${grant.chainId}`)
  const decimals = Number(selectFeeToken(caps, 'USDC').decimals)

  // Helper redelegates the granted budget onward to the relayer's target (redeemer).
  const redelegUnsigned = redelegate({
    environment: env,
    from: peer.address,
    to: caps.targetAddress,
    parent: grant.root,
    salt: randomSalt(),
  })
  const redelegSig = await signDelegation({
    privateKey: opts.peerKey,
    delegation: redelegUnsigned,
    delegationManager: env.DelegationManager as Hex,
    chainId: grant.chainId,
    // The redelegation adds no new caveat — it forwards the parent budget to the
    // relayer to redeem. The parent's erc20 limit still bounds it via the chain.
    allowInsecureUnrestrictedDelegation: true,
  })

  return submitUsdcWork({
    relayer,
    chainId: grant.chainId,
    feeCollector: caps.feeCollector,
    token: grant.token,
    decimals,
    permissionContext: [{ ...redelegUnsigned, signature: redelegSig }, grant.root], // leaf → root
    authEntry: grant.authorization,
    to: grant.to,
    amount: BigInt(grant.amount),
    memo: 'compass-hire',
  })
}

export interface RelayHireOpts {
  /** Owner key — the executing account (7702-upgraded), whose USDC moves. */
  ownerKey: Hex
  /** Peer (hired agent) key — redelegates onward to redeem. */
  peerKey: Hex
  chainId: number
  rpcUrl?: string
  endpoint: string
  to: Address
  amount: bigint
  environment?: SmartAccountsEnvironment
}

/**
 * A2A "hire" in one process (the agent controls both keys): owner grants a
 * narrowed USDC budget to a peer, the peer redeems it on-chain within the limit.
 * Composes {@link hireGrantFromOwner} + {@link hireRedeemAsPeer} — the same two
 * halves that ride the transport in a real two-machine hire.
 */
export async function relayHiredUsdcTransfer(opts: RelayHireOpts): Promise<RelayResult> {
  const peerAccount = privateKeyToAccount(opts.peerKey).address
  const grant = await hireGrantFromOwner({
    ownerKey: opts.ownerKey,
    peerAccount,
    chainId: opts.chainId,
    ...(opts.rpcUrl ? { rpcUrl: opts.rpcUrl } : {}),
    endpoint: opts.endpoint,
    to: opts.to,
    amount: opts.amount,
    ...(opts.environment ? { environment: opts.environment } : {}),
  })
  return hireRedeemAsPeer({
    peerKey: opts.peerKey,
    grant,
    ...(opts.rpcUrl ? { rpcUrl: opts.rpcUrl } : {}),
    endpoint: opts.endpoint,
    ...(opts.environment ? { environment: opts.environment } : {}),
  })
}
