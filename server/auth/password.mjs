import crypto from 'node:crypto'

const SCRYPT_N = 32768
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LEN = 64

// Small bundled list of top common insecure passwords
const COMMON_PASSWORDS = new Set([
  '1234567890',
  'password123',
  'admin12345',
  'administrator',
  'qwertyuiop',
  'welcome1234',
  'changeme123',
  'iloveyou123',
  'sunshine123',
  'princess123',
  'monkey12345',
  'football123',
])

export function validatePasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' }
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { valid: false, error: 'Password is too common and easily guessed' }
  }
  return { valid: true }
}

export async function hashPassword(password) {
  const strength = validatePasswordStrength(password)
  if (!strength.valid) {
    throw new Error(strength.error)
  }

  const salt = crypto.randomBytes(16).toString('hex')
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      KEY_LEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024 },
      (err, derivedKey) => {
        if (err) return reject(err)
        const hash = derivedKey.toString('hex')
        resolve(`scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`)
      }
    )
  })
}

export async function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') {
    return false
  }

  const parts = storedHash.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false
  }

  const [, nStr, rStr, pStr, salt, hash] = parts
  const N = parseInt(nStr, 10)
  const r = parseInt(rStr, 10)
  const p = parseInt(pStr, 10)

  if (isNaN(N) || isNaN(r) || isNaN(p) || !salt || !hash) {
    return false
  }

  return new Promise((resolve) => {
    crypto.scrypt(
      password,
      salt,
      KEY_LEN,
      { N, r, p, maxmem: 64 * 1024 * 1024 },
      (err, derivedKey) => {
        if (err) return resolve(false)
        const expectedBuffer = Buffer.from(hash, 'hex')
        if (expectedBuffer.length !== derivedKey.length) {
          return resolve(false)
        }
        try {
          resolve(crypto.timingSafeEqual(expectedBuffer, derivedKey))
        } catch {
          resolve(false)
        }
      }
    )
  })
}
