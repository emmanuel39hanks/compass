import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * AES-256-GCM keystore for the operator/agent private key. Key derived from a
 * passphrase via scrypt. Blob packs `salt(16) || iv(12) || tag(16) || ciphertext`.
 */
export interface EncryptedKeystore {
  version: 1
  /** Base64 `salt(16) || iv(12) || tag(16) || ciphertext`. */
  blob: string
}

const KEY_LEN = 32
const SCRYPT_N = 2 ** 15
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_MAXMEM = 64 * 1024 * 1024

function derive(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  })
}

export function encryptKey(privkey: Uint8Array, passphrase: string): EncryptedKeystore {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = derive(passphrase, salt)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(Buffer.from(privkey)), cipher.final()])
  const tag = cipher.getAuthTag()
  const blob = Buffer.concat([salt, iv, tag, ct]).toString('base64')
  return { version: 1, blob }
}

export function decryptKey(keystore: EncryptedKeystore, passphrase: string): Uint8Array {
  if (keystore.version !== 1) throw new Error(`unsupported keystore version: ${keystore.version}`)
  const buf = Buffer.from(keystore.blob, 'base64')
  const salt = buf.subarray(0, 16)
  const iv = buf.subarray(16, 28)
  const tag = buf.subarray(28, 44)
  const ct = buf.subarray(44)
  const key = derive(passphrase, salt)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return new Uint8Array(Buffer.concat([decipher.update(ct), decipher.final()]))
}

/** Encrypt a 0x-hex private key into a keystore. */
export function encryptHexKey(hex: `0x${string}`, passphrase: string): EncryptedKeystore {
  return encryptKey(hexToBytes(hex), passphrase)
}

/** Decrypt a keystore back to a 0x-hex private key. */
export function decryptHexKey(keystore: EncryptedKeystore, passphrase: string): `0x${string}` {
  return bytesToHex(decryptKey(keystore, passphrase))
}

export async function saveKeystore(path: string, keystore: EncryptedKeystore): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(keystore, null, 2), { mode: 0o600 })
}

export async function loadKeystore(path: string): Promise<EncryptedKeystore> {
  const raw = await readFile(path, 'utf8')
  return JSON.parse(raw) as EncryptedKeystore
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex
  const out = new Uint8Array(h.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16)
  return out
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let s = '0x'
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s as `0x${string}`
}
