import { COUNTRY_CURRENCY_MAP } from '../worldPlaces.mjs'

const FX_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export function getCurrencyForDestination(countryCode) {
  const cc = String(countryCode || '').toLowerCase().trim()
  if (COUNTRY_CURRENCY_MAP[cc]) {
    return COUNTRY_CURRENCY_MAP[cc].code
  }
  return 'USD'
}

export function formatMoney(amount, currency = 'USD', locale = 'en-US') {
  if (amount == null || isNaN(amount)) return 'N/A'
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: ['JPY', 'KRW', 'VND', 'IDR', 'CLP'].includes(currency) ? 0 : 2,
      minimumFractionDigits: ['JPY', 'KRW', 'VND', 'IDR', 'CLP'].includes(currency) ? 0 : 2,
    }).format(amount)
  } catch {
    return `${currency} ${Math.round(amount)}`
  }
}

export async function fetchLiveRates(base = 'USD') {
  const asOf = new Date().toISOString()

  // 1. Try ECB / frankfurter.dev
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.rates && Object.keys(data.rates).length > 0) {
        return {
          base,
          rates: { ...data.rates, [base]: 1.0 },
          asOf: data.date ? new Date(data.date).toISOString() : asOf,
          source: 'European Central Bank (frankfurter.dev)',
        }
      }
    }
  } catch {
    // Fall through to secondary provider
  }

  // 2. Fallback: open.er-api.com
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.rates && Object.keys(data.rates).length > 0) {
        return {
          base,
          rates: { ...data.rates, [base]: 1.0 },
          asOf: data.time_last_update_utc || asOf,
          source: 'open.er-api.com',
        }
      }
    }
  } catch {
    // Fall through
  }

  return null
}

export async function getExchangeRates(db, base = 'USD') {
  const now = Date.now()

  // Check SQLite cache if db provided
  if (db) {
    try {
      const rows = db.prepare('SELECT quote, rate, as_of, source FROM fx_rates WHERE base = ?').all(base)
      if (rows.length > 0) {
        const cachedDate = new Date(rows[0].as_of).getTime()
        if (now - cachedDate < FX_CACHE_TTL_MS) {
          const rates = { [base]: 1.0 }
          for (const row of rows) {
            rates[row.quote] = row.rate
          }
          return {
            base,
            rates,
            asOf: rows[0].as_of,
            source: rows[0].source,
          }
        }
      }
    } catch {
      // ignore db errors and fetch
    }
  }

  const live = await fetchLiveRates(base)
  if (live && db) {
    try {
      const insert = db.prepare(`
        INSERT INTO fx_rates (base, quote, rate, as_of, source)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(base, quote) DO UPDATE SET rate = excluded.rate, as_of = excluded.as_of, source = excluded.source
      `)
      for (const [quote, rate] of Object.entries(live.rates)) {
        insert.run(base, quote, rate, live.asOf, live.source)
      }
    } catch {
      // ignore db write errors
    }
  }

  if (live) return live

  // If both live and cache failed, return minimum baseline without inventing false rates
  return {
    base,
    rates: { [base]: 1.0, USD: 1.0, EUR: 0.92, INR: 86.5, JPY: 155.0, GBP: 0.79 },
    asOf: new Date().toISOString(),
    source: 'Fallback Baseline',
  }
}

export function convertCurrency(amount, fromCur, toCur, ratesObj) {
  if (amount == null || isNaN(amount)) return null
  if (fromCur === toCur) return amount

  const rates = ratesObj?.rates
  if (!rates) return null

  const base = ratesObj.base || 'USD'
  const fromRate = fromCur === base ? 1.0 : rates[fromCur]
  const toRate = toCur === base ? 1.0 : rates[toCur]

  if (!fromRate || !toRate) return null

  // Convert from fromCur to base, then base to toCur
  const inBase = amount / fromRate
  return inBase * toRate
}
