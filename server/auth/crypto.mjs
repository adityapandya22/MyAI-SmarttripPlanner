import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

/**
 * Derives a 32-byte key from ENCRYPTION_KEY env var or fallback in development.
 */
function getDerivedKey() {
  const secret = process.env.ENCRYPTION_KEY || 'default-dev-encryption-key-for-local-testing-only'
  return crypto.createHash('sha256').update(secret).digest()
}

/**
 * Encrypts a string using AES-256-GCM.
 * Output format: "iv_hex:tag_hex:ciphertext_hex"
 */
export function encryptData(plaintext) {
  if (typeof plaintext !== 'string') {
    throw new Error('Data to encrypt must be a string')
  }
  const iv = crypto.randomBytes(IV_LENGTH)
  const key = getDerivedKey()
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')
  return `${iv.toString('hex')}:${tag}:${encrypted}`
}

/**
 * Decrypts a string encrypted by encryptData.
 */
export function decryptData(encryptedString) {
  if (typeof encryptedString !== 'string') {
    throw new Error('Encrypted data must be a string')
  }
  const parts = encryptedString.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format')
  }
  const [ivHex, tagHex, ciphertextHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const key = getDerivedKey()

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

/**
 * Generates a cryptographically random 256-bit token (64 hex chars).
 */
export function generateToken() {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Computes SHA-256 hash of a session token for storage.
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Masks an API key or sensitive string, revealing only the last 4 characters.
 */
export function maskSecret(value) {
  if (!value || typeof value !== 'string') return ''
  if (value.length <= 4) return '****'
  return `...${value.slice(-4)}`
}
