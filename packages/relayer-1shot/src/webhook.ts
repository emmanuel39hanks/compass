import * as ed from '@noble/ed25519'
import stringify from 'safe-stable-stringify'
import type { WebhookPayload } from './types'

/**
 * Canonical bytes signed by the relayer: the payload with `signature` removed,
 * serialized with stable (sorted-key) JSON. The signature value itself is
 * excluded, so it is irrelevant to the recomputed message.
 */
export function canonicalWebhookMessage(payload: WebhookPayload): Uint8Array {
  const { signature: _signature, ...rest } = payload
  return new TextEncoder().encode(stringify(rest) ?? '')
}

/** Verify a webhook's Ed25519 signature against a raw public key. */
export async function verifyWebhookSignature(
  payload: WebhookPayload,
  publicKey: Uint8Array,
): Promise<boolean> {
  try {
    const sig = Uint8Array.from(Buffer.from(payload.signature, 'base64'))
    return await ed.verifyAsync(sig, canonicalWebhookMessage(payload), publicKey)
  } catch {
    return false
  }
}

/** Decode a JWKS OKP/Ed25519 key (base64url `x`) to raw public-key bytes. */
export function jwkToPublicKey(jwk: { x: string }): Uint8Array {
  return Uint8Array.from(Buffer.from(jwk.x, 'base64url'))
}

export interface Jwk {
  kid?: string
  kty?: string
  crv?: string
  x: string
}

/** Resolve a public key from a JWKS document by keyId. */
export function publicKeyFromJwks(jwks: { keys: Jwk[] }, keyId: string): Uint8Array {
  const jwk = jwks.keys.find(k => k.kid === keyId)
  if (!jwk) throw new Error(`no JWKS key for keyId ${keyId}`)
  return jwkToPublicKey(jwk)
}
