import { expect, test } from 'bun:test'
import { eip7702Implementation, toAuthorizationListEntry } from './auth-7702'

test('toAuthorizationListEntry stringifies numeric fields', () => {
  const entry = toAuthorizationListEntry({
    chainId: 8453,
    address: '0x7702000000000000000000000000000000000000',
    nonce: 3,
    r: '0x01',
    s: '0x02',
    yParity: 1,
  })
  expect(entry).toEqual({
    address: '0x7702000000000000000000000000000000000000',
    chainId: '8453',
    nonce: '3',
    r: '0x01',
    s: '0x02',
    yParity: '1',
  })
})

test('eip7702Implementation resolves an address or fails clearly', () => {
  try {
    const addr = eip7702Implementation(11155111)
    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/)
  } catch (e) {
    expect((e as Error).message).toContain('EIP-7702')
  }
})
