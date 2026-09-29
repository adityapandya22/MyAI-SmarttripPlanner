import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { convertCurrency, formatMoney } from './fx.mjs'
import { createProvenance } from './provenance.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const costTablePath = join(__dirname, 'data', 'costTable.json')
let costData = null

function loadCostTable() {
  if (!costData) {
    try {
      costData = JSON.parse(readFileSync(costTablePath, 'utf8'))
    } catch {
      costData = { countries: {} }
    }
  }
  return costData
}

export function getCostDataForCountry(countryCode) {
  const table = loadCostTable()
  const cc = String(countryCode || '').toLowerCase().trim()
  return table.countries[cc] || null
}

export function computeTripBudget({
  countryCode = 'in',
  daysCount = 3,
  travelersCount = 2,
  tier = 'mid', // 'budget' | 'mid' | 'luxury'
  tripCurrency = 'INR',
  homeCurrency = 'INR',
  homeLocale = 'en-IN',
  fxRates = null,
  knownActivityFees = [], // array of numbers
  selfDriveDistanceKm = 0,
  vehicleEfficiencyLPer100Km = 8.0,
} = {}) {
  const validTier = ['budget', 'mid', 'luxury'].includes(tier) ? tier : 'mid'
  const countryCosts = getCostDataForCountry(countryCode)
  const days = Math.max(1, Number(daysCount) || 1)
  const travelers = Math.max(1, Number(travelersCount) || 1)
  const rooms = Math.ceil(travelers / 2) // standard double occupancy assumption

  // Variance multipliers for low and high range
  const tierVariance = {
    budget: { low: 0.85, likely: 1.0, high: 1.2 },
    mid: { low: 0.85, likely: 1.0, high: 1.25 },
    luxury: { low: 0.8, likely: 1.0, high: 1.4 },
  }[validTier]

  let baseUsd = countryCosts?.tiers?.[validTier]
  let hasCostData = true

  if (!baseUsd) {
    hasCostData = false
    baseUsd = { accommodation: 50, food: 30, localTransport: 10, activities: 15 }
  }

  // Calculate per day items in USD
  const stayPerDayUsd = baseUsd.accommodation * rooms
  const foodPerDayUsd = baseUsd.food * travelers
  const transportPerDayUsd = baseUsd.localTransport * travelers

  // Activities: sum known fees if any, plus baseline tier estimates for missing ones
  const knownSumUsd = knownActivityFees.reduce((acc, f) => acc + (Number(f) || 0), 0)
  const activitiesPerDayUsd = knownSumUsd > 0
    ? knownSumUsd / days
    : baseUsd.activities * travelers

  // Fuel calculation for self-drive
  const fuelPriceUsd = countryCosts?.fuelPricePerLiterUsd || 1.25
  const totalLiters = (selfDriveDistanceKm / 100) * vehicleEfficiencyLPer100Km
  const fuelTotalUsd = totalLiters * fuelPriceUsd

  const dailyTotalUsd = stayPerDayUsd + foodPerDayUsd + transportPerDayUsd + activitiesPerDayUsd
  const tripBaseUsd = dailyTotalUsd * days + fuelTotalUsd
  const contingencyUsd = tripBaseUsd * 0.10 // 10% contingency

  const totalUsd = {
    low: (tripBaseUsd * tierVariance.low) + (contingencyUsd * 0.5),
    likely: tripBaseUsd + contingencyUsd,
    high: (tripBaseUsd * tierVariance.high) + (contingencyUsd * 1.5),
  }

  // Convert to tripCurrency and homeCurrency
  const ratesObj = fxRates || { base: 'USD', rates: { USD: 1.0, INR: 86.5, EUR: 0.92 } }

  function convertRange(rangeUsd) {
    return {
      low: Math.round(convertCurrency(rangeUsd.low, 'USD', tripCurrency, ratesObj) || rangeUsd.low),
      likely: Math.round(convertCurrency(rangeUsd.likely, 'USD', tripCurrency, ratesObj) || rangeUsd.likely),
      high: Math.round(convertCurrency(rangeUsd.high, 'USD', tripCurrency, ratesObj) || rangeUsd.high),
    }
  }

  const totalTripCurrency = convertRange(totalUsd)
  const perPersonTripCurrency = {
    low: Math.round(totalTripCurrency.low / travelers),
    likely: Math.round(totalTripCurrency.likely / travelers),
    high: Math.round(totalTripCurrency.high / travelers),
  }

  const totalHomeCurrency = {
    low: Math.round(convertCurrency(totalTripCurrency.low, tripCurrency, homeCurrency, ratesObj) || totalTripCurrency.low),
    likely: Math.round(convertCurrency(totalTripCurrency.likely, tripCurrency, homeCurrency, ratesObj) || totalTripCurrency.likely),
    high: Math.round(convertCurrency(totalTripCurrency.high, tripCurrency, homeCurrency, ratesObj) || totalTripCurrency.high),
  }

  const categories = {
    accommodation: Math.round(convertCurrency(stayPerDayUsd * days, 'USD', tripCurrency, ratesObj) || stayPerDayUsd * days),
    food: Math.round(convertCurrency(foodPerDayUsd * days, 'USD', tripCurrency, ratesObj) || foodPerDayUsd * days),
    localTransport: Math.round(convertCurrency(transportPerDayUsd * days, 'USD', tripCurrency, ratesObj) || transportPerDayUsd * days),
    activities: Math.round(convertCurrency(activitiesPerDayUsd * days, 'USD', tripCurrency, ratesObj) || activitiesPerDayUsd * days),
    fuel: Math.round(convertCurrency(fuelTotalUsd, 'USD', tripCurrency, ratesObj) || fuelTotalUsd),
    contingency: Math.round(convertCurrency(contingencyUsd, 'USD', tripCurrency, ratesObj) || contingencyUsd),
  }

  return {
    hasCostData,
    currency: tripCurrency,
    homeCurrency,
    ratesAsOf: ratesObj.asOf || new Date().toISOString(),
    daysCount: days,
    travelersCount: travelers,
    tier: validTier,
    total: totalTripCurrency,
    perPerson: perPersonTripCurrency,
    totalHome: totalHomeCurrency,
    formatted: {
      tripTotal: `${formatMoney(totalTripCurrency.low, tripCurrency, homeLocale)} – ${formatMoney(totalTripCurrency.high, tripCurrency, homeLocale)}`,
      homeEquivalent: `≈ ${formatMoney(totalHomeCurrency.likely, homeCurrency, homeLocale)}`,
    },
    categories,
    provenance: createProvenance({
      source: hasCostData ? 'cost-table' : 'bundled',
      confidence: hasCostData ? 'estimate' : 'sample',
      sourceUrl: countryCosts?.source,
    }),
  }
}
