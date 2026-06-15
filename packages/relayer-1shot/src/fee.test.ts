import { expect, test } from 'bun:test'
import { feeAmount, selectFeeToken } from './fee'
import type { RelayerCapabilities } from './types'

const caps: RelayerCapabilities = {
  feeCollector: '0xfee0000000000000000000000000000000000000',
  targetAddress: '0x7a59000000000000000000000000000000000000',
  tokens: [
    { address: '0xusdc', symbol: 'USDC', name: 'USD Coin', decimals: '6' },
    { address: '0xusdt', symbol: 'USDT', name: 'Tether', decimals: '6' },
  ],
}

test('selectFeeToken finds USDC by default', () => {
  expect(selectFeeToken(caps).symbol).toBe('USDC')
})

test('selectFeeToken is case-insensitive and supports other symbols', () => {
  expect(selectFeeToken(caps, 'usdt').symbol).toBe('USDT')
})

test('selectFeeToken throws for an unsupported token', () => {
  expect(() => selectFeeToken(caps, 'DAI')).toThrow(/not accepted/)
})

test('feeAmount applies the min-fee floor', () => {
  expect(feeAmount(100n, 500n)).toBe(500n)
  expect(feeAmount(800n, 500n)).toBe(800n)
})
