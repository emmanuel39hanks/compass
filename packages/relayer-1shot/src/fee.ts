import type { RelayerCapabilities, RelayerToken } from './types'

/** Pick the stablecoin to pay gas in, by symbol (default USDC). */
export function selectFeeToken(caps: RelayerCapabilities, symbol = 'USDC'): RelayerToken {
  const token = caps.tokens.find(t => t.symbol.toUpperCase() === symbol.toUpperCase())
  if (!token) {
    const available = caps.tokens.map(t => t.symbol).join(', ')
    throw new Error(`fee token ${symbol} not accepted on this chain (have: ${available})`)
  }
  return token
}

/** Fee floor: the relayer charges max(convertedFee, minFee). */
export function feeAmount(convertedFee: bigint, minFee: bigint): bigint {
  return convertedFee > minFee ? convertedFee : minFee
}
