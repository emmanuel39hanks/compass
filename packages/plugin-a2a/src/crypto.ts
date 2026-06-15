import { xchacha20poly1305 } from '@noble/ciphers/chacha'
import { secp256k1 } from '@noble/curves/secp256k1'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha256'
import { randomBytes } from '@noble/hashes/utils'
import { type Hex, bytesToHex, hexToBytes } from 'viem'
import type { A2AEnvelope } from './envelope'

/**
 * The A2A wire crypto: a sender signs every envelope with its agent key, and the
 * authority-bearing payload is sealed to the recipient's published pubkey (ECIES).
 * Routing (from/to/kind) stays in the clear; the delegation/task does not. This
 * is what makes a real transport trustworthy — the receiver verifies the sender
 * and no one in the middle reads the grant.
 */

/** The compressed secp256k1 public key (33 bytes, 0x-hex) for an agent private key. */
export function publicKeyFor(privateKey: Hex): Hex {
  return bytesToHex(secp256k1.getPublicKey(hexToBytes(privateKey), true))
}

/** Sign bytes with an agent key → 64-byte compact signature (0x-hex). */
export function signBytes(privateKey: Hex, message: Uint8Array): Hex {
  const sig = secp256k1.sign(sha256(message), hexToBytes(privateKey))
  return bytesToHex(sig.toCompactRawBytes())
}

/** Verify a compact signature against the signer's published pubkey. */
export function verifyBytes(pubkey: Hex, message: Uint8Array, signature: Hex): boolean {
  try {
    return secp256k1.verify(hexToBytes(signature), sha256(message), hexToBytes(pubkey))
  } catch {
    return false
  }
}

// --- ECIES: secp256k1 ECDH → HKDF-SHA256 → XChaCha20-Poly1305 ---

const HKDF_INFO = new TextEncoder().encode('compass-a2a-ecies-v1')

function deriveKey(sharedPoint: Uint8Array): Uint8Array {
  // sharedPoint is the compressed ECDH point (33 bytes); key on its x-coordinate.
  return hkdf(sha256, sharedPoint.slice(1), undefined, HKDF_INFO, 32)
}

export interface EciesOptions {
  /** Test-only: fix the ephemeral key + nonce for deterministic output. */
  ephemeralKey?: Hex
  nonce?: Uint8Array
}

/**
 * Encrypt to a recipient's compressed pubkey.
 * Layout: ephPub(33) ‖ nonce(24) ‖ ciphertext+tag. Only the matching private key reads it.
 */
export function eciesEncrypt(
  recipientPubkey: Hex,
  plaintext: Uint8Array,
  opts: EciesOptions = {},
): Hex {
  const ephPriv = opts.ephemeralKey
    ? hexToBytes(opts.ephemeralKey)
    : secp256k1.utils.randomPrivateKey()
  const ephPub = secp256k1.getPublicKey(ephPriv, true)
  const shared = secp256k1.getSharedSecret(ephPriv, hexToBytes(recipientPubkey))
  const key = deriveKey(shared)
  const nonce = opts.nonce ?? randomBytes(24)
  const ct = xchacha20poly1305(key, nonce).encrypt(plaintext)
  const blob = new Uint8Array(33 + 24 + ct.length)
  blob.set(ephPub, 0)
  blob.set(nonce, 33)
  blob.set(ct, 57)
  return bytesToHex(blob)
}

/** Decrypt an ECIES blob with the recipient's private key. Throws on tamper. */
export function eciesDecrypt(recipientPrivkey: Hex, blob: Hex): Uint8Array {
  const bytes = hexToBytes(blob)
  const ephPub = bytes.slice(0, 33)
  const nonce = bytes.slice(33, 57)
  const ct = bytes.slice(57)
  const shared = secp256k1.getSharedSecret(hexToBytes(recipientPrivkey), ephPub)
  const key = deriveKey(shared)
  return xchacha20poly1305(key, nonce).decrypt(ct)
}

// --- Canonical serialization (stable across machines for signing) ---

/** Deterministic JSON: object keys sorted, arrays preserved. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  const body = keys
    .map(k => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(',')
  return `{${body}}`
}

// --- Sealed envelope (sign + encrypt the authority payload) ---

/** The private part of an envelope — sealed to the recipient. */
interface EnvelopeBody {
  task?: string
  delegation?: A2AEnvelope['delegation']
  grant?: A2AEnvelope['grant']
  result?: string
  note?: string
}

/** The on-the-wire form: clear routing + sealed body + sender signature. */
export interface SealedMessage {
  from: string
  to: string
  kind: A2AEnvelope['kind']
  /** ECIES(recipientPubkey, JSON(body)). */
  ciphertext: Hex
  /** secp256k1 signature over the canonical {from,to,kind,ciphertext}. */
  sig: Hex
  /** Sender's compressed pubkey — verify before trusting `from`. */
  pubkey: Hex
}

function routingBytes(m: Pick<SealedMessage, 'from' | 'to' | 'kind' | 'ciphertext'>): Uint8Array {
  return new TextEncoder().encode(
    stableStringify({ from: m.from, to: m.to, kind: m.kind, ciphertext: m.ciphertext }),
  )
}

/** Seal an envelope: encrypt its payload to `recipientPubkey`, sign with `senderKey`. */
export function sealEnvelope(
  envelope: A2AEnvelope,
  senderKey: Hex,
  recipientPubkey: Hex,
  opts: EciesOptions = {},
): SealedMessage {
  const body: EnvelopeBody = {
    ...(envelope.task !== undefined ? { task: envelope.task } : {}),
    ...(envelope.delegation !== undefined ? { delegation: envelope.delegation } : {}),
    ...(envelope.grant !== undefined ? { grant: envelope.grant } : {}),
    ...(envelope.result !== undefined ? { result: envelope.result } : {}),
    ...(envelope.note !== undefined ? { note: envelope.note } : {}),
  }
  const ciphertext = eciesEncrypt(
    recipientPubkey,
    new TextEncoder().encode(JSON.stringify(body)),
    opts,
  )
  const partial = { from: envelope.from, to: envelope.to, kind: envelope.kind, ciphertext }
  return {
    ...partial,
    sig: signBytes(senderKey, routingBytes(partial)),
    pubkey: publicKeyFor(senderKey),
  }
}

/**
 * Open a sealed message: verify the sender signature, then decrypt the payload
 * with the recipient's private key. `expectedPubkey` (the sender's on-chain
 * pubkey) is checked when given, so a peer can't spoof `from`.
 */
export function openEnvelope(
  sealed: SealedMessage,
  recipientPrivkey: Hex,
  expectedPubkey?: Hex,
): A2AEnvelope {
  if (expectedPubkey && sealed.pubkey.toLowerCase() !== expectedPubkey.toLowerCase()) {
    throw new Error(`sender pubkey mismatch for "${sealed.from}"`)
  }
  const partial = {
    from: sealed.from,
    to: sealed.to,
    kind: sealed.kind,
    ciphertext: sealed.ciphertext,
  }
  if (!verifyBytes(sealed.pubkey, routingBytes(partial), sealed.sig)) {
    throw new Error(`bad signature on message from "${sealed.from}"`)
  }
  const body = JSON.parse(
    new TextDecoder().decode(eciesDecrypt(recipientPrivkey, sealed.ciphertext)),
  ) as EnvelopeBody
  return { from: sealed.from, to: sealed.to, kind: sealed.kind, ...body }
}
