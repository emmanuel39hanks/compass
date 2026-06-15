import { expect, test } from 'bun:test'
import * as ed from '@noble/ed25519'
import type { WebhookPayload } from './types'
import { canonicalWebhookMessage, verifyWebhookSignature } from './webhook'

function payload(overrides: Partial<WebhookPayload> = {}): WebhookPayload {
  return {
    apiVersion: 0,
    type: 0,
    data: { id: '0xabc0000000000000000000000000000000000000000000000000000000000000', status: 200 },
    timestamp: 1_700_000_000,
    keyId: 'k1',
    signature: '',
    ...overrides,
  }
}

async function sign(p: WebhookPayload, priv: Uint8Array): Promise<WebhookPayload> {
  const sig = await ed.signAsync(canonicalWebhookMessage(p), priv)
  return { ...p, signature: Buffer.from(sig).toString('base64') }
}

test('verifies a correctly signed webhook', async () => {
  const priv = ed.utils.randomPrivateKey()
  const pub = await ed.getPublicKeyAsync(priv)
  const signed = await sign(payload(), priv)
  expect(await verifyWebhookSignature(signed, pub)).toBe(true)
})

test('rejects a tampered webhook', async () => {
  const priv = ed.utils.randomPrivateKey()
  const pub = await ed.getPublicKeyAsync(priv)
  const signed = await sign(payload(), priv)
  const tampered: WebhookPayload = { ...signed, data: { ...signed.data, status: 500 } }
  expect(await verifyWebhookSignature(tampered, pub)).toBe(false)
})

test('rejects a webhook signed by a different key', async () => {
  const priv = ed.utils.randomPrivateKey()
  const otherPub = await ed.getPublicKeyAsync(ed.utils.randomPrivateKey())
  const signed = await sign(payload(), priv)
  expect(await verifyWebhookSignature(signed, otherPub)).toBe(false)
})
