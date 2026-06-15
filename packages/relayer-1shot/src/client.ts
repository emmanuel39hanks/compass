import type { Hex } from 'viem'
import {
  RELAYER_MAINNET,
  type RelayerCapabilities,
  type RelayerStatusResponse,
  type Send7710Input,
} from './types'

export type FetchImpl = typeof fetch

export interface OneShotRelayerOpts {
  endpoint?: string
  fetchImpl?: FetchImpl
}

interface JsonRpcResponse<T> {
  result?: T
  error?: { code?: number; message?: string }
}

/** Build the `relayer_send7710Transaction` params object from inputs. */
export function buildSend7710Params(input: Send7710Input): Record<string, unknown> {
  const params: Record<string, unknown> = {
    chainId: String(input.chainId),
    transactions: [{ permissionContext: input.permissionContext, executions: input.executions }],
  }
  if (input.authorizationList) params.authorizationList = input.authorizationList
  if (input.context) params.context = input.context
  if (input.destinationUrl) params.destinationUrl = input.destinationUrl
  if (input.memo) params.memo = input.memo
  return params
}

/**
 * Thin JSON-RPC client for the 1Shot permissionless relayer. No API key, no
 * signup — pay per tx in stablecoin. See docs/INTEGRATIONS.md#1shot.
 */
export class OneShotRelayer {
  private readonly endpoint: string
  private readonly fetchImpl: FetchImpl
  private id = 0

  constructor(opts: OneShotRelayerOpts = {}) {
    this.endpoint = opts.endpoint ?? RELAYER_MAINNET
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  private async rpc<T>(method: string, params: unknown): Promise<T> {
    this.id += 1
    const res = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: this.id, method, params }),
    })
    if (!res.ok) throw new Error(`relayer ${method} HTTP ${res.status}`)
    const json = (await res.json()) as JsonRpcResponse<T>
    if (json.error)
      throw new Error(`relayer ${method} error ${json.error.code}: ${json.error.message}`)
    if (json.result === undefined) throw new Error(`relayer ${method}: empty result`)
    return json.result
  }

  getCapabilities(chainIds: Array<number | string>): Promise<Record<string, RelayerCapabilities>> {
    return this.rpc('relayer_getCapabilities', chainIds.map(String))
  }

  estimate7710(input: Send7710Input): Promise<{ requiredPaymentAmount?: string; context: string }> {
    return this.rpc('relayer_estimate7710Transaction', buildSend7710Params(input))
  }

  /** Returns the TaskId. */
  send7710(input: Send7710Input): Promise<Hex> {
    return this.rpc('relayer_send7710Transaction', buildSend7710Params(input))
  }

  getStatus(id: Hex, logs = false): Promise<RelayerStatusResponse> {
    return this.rpc('relayer_getStatus', { id, logs })
  }
}
