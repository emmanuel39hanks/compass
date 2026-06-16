import { expect, test } from 'bun:test'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseUnits, toHex } from 'viem'
import { buildPermissionsRequest, runConnect } from './connect'

const TARGET = '0x2222222222222222222222222222222222222222' as const

const GRANTEE = '0x9f2B803128D37Ccc751e426CC8f8A9E7Ece13ab8' as const
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const

test('buildPermissionsRequest produces a valid ERC-7715 erc20-token-periodic request', () => {
  const req = buildPermissionsRequest({
    chainId: 84_532,
    grantee: GRANTEE,
    token: USDC,
    periodAmount: parseUnits('25', 6),
    periodSeconds: 604_800,
  })
  expect(req).toHaveLength(1)
  const p = req[0]!
  expect(p.chainId).toBe(toHex(84_532)) // hex-encoded chain id
  expect(p.to).toBe(GRANTEE) // grantee = the agent (session account), not `signer`
  expect(p).not.toHaveProperty('expiry') // this method rejects a top-level expiry
  expect(p).not.toHaveProperty('signer')
  expect(p.rules).toEqual([]) // required top-level array ("0.rules: Required" otherwise)
  expect(p.permission.type).toBe('erc20-token-periodic')
  expect(p.permission.isAdjustmentAllowed).toBe(true) // user can tweak the cap before approving
  expect(p.permission.data.tokenAddress).toBe(USDC) // `tokenAddress`, not `token`
  expect(p.permission.data.periodAmount).toBe(toHex(25_000_000n)) // 25 USDC, hex
  expect(p.permission.data.periodDuration).toBe(604_800)
})

test('connect server: page renders + a posted grant is captured and saved', async () => {
  const out = join(tmpdir(), `compass-grant-${Date.now()}.json`)
  let url = ''
  const done = runConnect({
    grantee: TARGET,
    chainId: 84_532,
    budget: '25 USDC/week',
    outPath: out,
    open: u => {
      url = u
    },
  })
  await new Promise(r => setTimeout(r, 200))

  const page = await (await fetch(url)).text()
  expect(page).toContain('wallet_requestExecutionPermissions') // the ERC-7715 call
  expect(page).toContain('wallet_switchEthereumChain') // switches MetaMask to the budget's chain first
  expect(page).toContain('wallet_addEthereumChain') // …adding it if unknown (error 4902)
  expect(page).toContain(TARGET) // grantee (to) embedded for the client-side request
  expect(page).toContain('value="25"') // editable budget, prefilled from config
  expect(page).toContain('USDC') // the token unit

  await fetch(`${url}/grant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ permissionsContext: '0xdeadbeef', account: TARGET }),
  })
  const granted = await done
  expect(granted.permissionsContext).toBe('0xdeadbeef')
  expect(granted.grantee).toBe(TARGET)
  expect(JSON.parse(readFileSync(out, 'utf8')).permissionsContext).toBe('0xdeadbeef')
  rmSync(out)
})
