import { expect, test } from 'bun:test'
import { erc20TransferExecution } from './execute'

test('erc20TransferExecution encodes an ERC-20 transfer', () => {
  const ex = erc20TransferExecution(
    '0x0000000000000000000000000000000000000001',
    '0x0000000000000000000000000000000000000002',
    1_000_000n,
  )
  expect(ex.value).toBe('0')
  expect(ex.target).toBe('0x0000000000000000000000000000000000000001')
  // transfer(address,uint256) selector
  expect(ex.data.startsWith('0xa9059cbb')).toBe(true)
})
