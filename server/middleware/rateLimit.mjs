export class RateLimiter {
  constructor({ windowMs = 60 * 1000, max = 60, name = 'rate-limit' } = {}) {
    this.windowMs = windowMs
    this.max = max
    this.name = name
    this.hits = new Map() // key -> Array of timestamps

    // Periodic sweep to clean up old keys
    setInterval(() => this.cleanup(), windowMs).unref()
  }

  cleanup() {
    const now = Date.now()
    for (const [key, timestamps] of this.hits.entries()) {
      const valid = timestamps.filter((t) => now - t < this.windowMs)
      if (valid.length === 0) {
        this.hits.delete(key)
      } else {
        this.hits.set(key, valid)
      }
    }
  }

  consume(key) {
    const now = Date.now()
    const timestamps = this.hits.get(key) || []
    const recent = timestamps.filter((t) => now - t < this.windowMs)

    if (recent.length >= this.max) {
      const oldest = recent[0]
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000))
      return { allowed: false, retryAfterSeconds, current: recent.length, max: this.max }
    }

    recent.push(now)
    this.hits.set(key, recent)
    return { allowed: true, current: recent.length, max: this.max }
  }

  reset(key) {
    if (key) {
      this.hits.delete(key)
    } else {
      this.hits.clear()
    }
  }
}

export const authRateLimiter = new RateLimiter({ windowMs: 60 * 1000, max: 30, name: 'auth' })
export const placesRateLimiter = new RateLimiter({ windowMs: 60 * 1000, max: 60, name: 'places' })
export const chatRateLimiter = new RateLimiter({ windowMs: 60 * 1000, max: 20, name: 'chat' })
