import { expect, test } from 'bun:test'
import { parseUnits, toHex } from 'viem'
import { buildPermissionsRequest } from './connect'

const GRANTEE = '0x9f2B803128D37Ccc751e426CC8f8A9E7Ece13ab8' as const
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const

test('buildPermissionsRequest produces a valid ERC-7715 erc20-token-periodic request', () => {
  const req = buildPermissionsRequest({
    chainId: 84_532,
    grantee: GRANTEE,
    token: USDC,
    periodAmount: parseUnits('25', 6),
    periodSeconds: 604_800,
    startTime: 1_700_000_000,
    expiry: 1_700_000_000 + 30 * 86_400,
  })
  expect(req).toHaveLength(1)
  const p = req[0]!
  expect(p.chainId).toBe(toHex(84_532)) // hex-encoded chain id
  expect(p.signer).toEqual({ type: 'account', data: { address: GRANTEE } }) // grantee = the agent
  expect(p.permission.type).toBe('erc20-token-periodic')
  expect(p.permission.data.token).toBe(USDC)
  expect(p.permission.data.periodAmount).toBe(toHex(25_000_000n)) // 25 USDC, hex
  expect(p.permission.data.periodDuration).toBe(604_800)
  expect(p.expiry).toBeGreaterThan(p.permission.data.startTime)
})
