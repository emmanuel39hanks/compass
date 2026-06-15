import type { Delegation } from '@compass_agents/delegation'
import type { Hex } from 'viem'

export const RELAYER_MAINNET = 'https://relayer.1shotapi.com/relayers'
export const RELAYER_TESTNET = 'https://relayer.1shotapi.dev/relayers'

export interface RelayerToken {
  address: Hex
  symbol: string
  name: string
  decimals: string
}

export interface RelayerCapabilities {
  feeCollector: Hex
  targetAddress: Hex
  tokens: RelayerToken[]
}

/** EIP-7702 authorization tuple in the relayer's wire shape (all stringified). */
export interface AuthorizationListEntry {
  address: Hex
  chainId: string
  nonce: string
  r: Hex
  s: Hex
  yParity: string
}

/** A call the relayer executes inside the redemption bundle. */
export interface RelayerExecution {
  target: Hex
  value: string
  data: Hex
}

export interface Send7710Input {
  chainId: number
  /**
   * The delegation chain [leaf, …, root] authorising the action — either decoded
   * `Delegation` structs (the local-key path) or an encoded `Hex` permission
   * context (e.g. from an ERC-7715 grant). The relayer accepts both.
   */
  permissionContext: Delegation[] | Hex
  executions: RelayerExecution[]
  authorizationList?: AuthorizationListEntry[]
  /** Price-lock context returned by estimate. */
  context?: string
  destinationUrl?: string
  memo?: string
}

/** getStatus codes: 100 pending, 110 submitted, 200 confirmed, 400 rejected, 500 reverted. */
export type RelayerStatusCode = 100 | 110 | 200 | 400 | 500

export interface RelayerStatusResponse {
  id: Hex
  status: number
  hash?: Hex
  receipt?: unknown
  message?: string
  data?: unknown
}

/** Webhook body: signature is a FIELD (not a header); verify with Ed25519/JWKS. */
export interface WebhookPayload {
  apiVersion: number
  /** 4 = submitted, 0 = confirmed, 1 = failure. */
  type: number
  data: RelayerStatusResponse
  timestamp: number
  keyId: string
  signature: string
}
