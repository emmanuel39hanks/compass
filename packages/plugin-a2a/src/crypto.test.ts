import { expect, test } from 'bun:test'
import { generatePrivateKey } from 'viem/accounts'
import {
  eciesDecrypt,
  eciesEncrypt,
  openEnvelope,
  publicKeyFor,
  sealEnvelope,
  signBytes,
  stableStringify,
  verifyBytes,
} from './crypto'
import type { A2AEnvelope } from './envelope'

const enc = new TextEncoder()
const dec = new TextDecoder()

test('sign/verify: good signature verifies, wrong key + tamper fail', () => {
  const key = generatePrivateKey()
  const other = generatePrivateKey()
  const msg = enc.encode('move 0.1 USDC')
  const sig = signBytes(key, msg)
  expect(verifyBytes(publicKeyFor(key), msg, sig)).toBe(true)
  expect(verifyBytes(publicKeyFor(other), msg, sig)).toBe(false)
  expect(verifyBytes(publicKeyFor(key), enc.encode('move 1 USDC'), sig)).toBe(false)
})

test('ecies: round-trips to the holder, rejects the wrong key', () => {
  const bob = generatePrivateKey()
  const blob = eciesEncrypt(publicKeyFor(bob), enc.encode('secret budget'))
  expect(dec.decode(eciesDecrypt(bob, blob))).toBe('secret budget')
  expect(() => eciesDecrypt(generatePrivateKey(), blob)).toThrow()
})

test('ecies: tampered ciphertext fails the auth tag', () => {
  const bob = generatePrivateKey()
  const blob = eciesEncrypt(publicKeyFor(bob), enc.encode('hello'))
  const flipped = `${blob.slice(0, blob.length - 2)}00` as `0x${string}`
  expect(() => eciesDecrypt(bob, flipped)).toThrow()
})

test('stableStringify is order-independent for object keys', () => {
  expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }))
  expect(stableStringify([{ y: 1, x: 2 }])).toBe('[{"x":2,"y":1}]')
})

test('seal/open: payload is hidden, sender verified, spoof rejected', () => {
  const alice = generatePrivateKey()
  const bob = generatePrivateKey()
  const env: A2AEnvelope = {
    from: 'alice',
    to: 'bob',
    kind: 'request',
    task: 'fetch ETH price',
    note: 'budget 1 USDC',
  }
  const sealed = sealEnvelope(env, alice, publicKeyFor(bob))
  // the task does not appear in the ciphertext
  expect(sealed.ciphertext.includes(Buffer.from('fetch').toString('hex'))).toBe(false)
  const opened = openEnvelope(sealed, bob, publicKeyFor(alice))
  expect(opened).toMatchObject(env)
  // a forged pubkey (claims to be alice) is rejected
  expect(() =>
    openEnvelope({ ...sealed, pubkey: publicKeyFor(bob) }, bob, publicKeyFor(alice)),
  ).toThrow(/pubkey mismatch/)
})

test('seal/open: a grant payload survives the round-trip', () => {
  const alice = generatePrivateKey()
  const bob = generatePrivateKey()
  const grant = {
    root: { delegate: '0xabc', delegator: '0xdef', authority: '0x0', caveats: [], salt: '0x1' },
    authorization: {
      address: '0x1',
      chainId: '84532',
      nonce: '0',
      r: '0x2',
      s: '0x3',
      yParity: '0',
    },
    to: '0x4444444444444444444444444444444444444444',
    amount: '100000',
    chainId: 84_532,
    token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  } as unknown as A2AEnvelope['grant']
  const sealed = sealEnvelope(
    { from: 'alice', to: 'bob', kind: 'grant', grant },
    alice,
    publicKeyFor(bob),
  )
  const opened = openEnvelope(sealed, bob, publicKeyFor(alice))
  expect(opened.grant).toEqual(grant)
})
