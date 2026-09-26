/* EUR→USD and USD→INR rates for fuel prices and budget (frankfurter.dev, free, no key).
   Cached for 24h; sensible constants cover the first render and offline use. */
const KEY = 'tripplanner.fx.eurusd'
const KEY_INR = 'tripplanner.fx.inrusd'
let rate = 1.08
let inrRate = 83.5

try {
  const c = JSON.parse(localStorage.getItem(KEY) ?? 'null')
  if (c?.v > 0) rate = c.v
} catch { /* corrupt cache */ }

try {
  const cInr = JSON.parse(localStorage.getItem(KEY_INR) ?? 'null')
  if (cInr?.v > 0) inrRate = cInr.v
} catch { /* corrupt cache */ }

export function eurUsd() {
  return rate
}

export function inrUsd() {
  return inrRate
}

export async function refreshFx() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (c?.v > 0 && Date.now() - c.t < 86_400_000) {
      rate = c.v
      const cInr = JSON.parse(localStorage.getItem(KEY_INR) ?? 'null')
      if (cInr?.v > 0) inrRate = cInr.v
      return rate
    }
    const r = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD,INR')
    const data = await r.json()
    if (data?.rates?.USD > 0) {
      rate = data.rates.USD
      localStorage.setItem(KEY, JSON.stringify({ v: rate, t: Date.now() }))
    }
    if (data?.rates?.INR > 0 && data?.rates?.USD > 0) {
      inrRate = data.rates.INR / data.rates.USD
      localStorage.setItem(KEY_INR, JSON.stringify({ v: inrRate, t: Date.now() }))
    } else if (data?.rates?.INR > 0) {
      inrRate = data.rates.INR / 1.08
      localStorage.setItem(KEY_INR, JSON.stringify({ v: inrRate, t: Date.now() }))
    }
  } catch { /* offline: keep the cached/default rate */ }
  return rate
}
