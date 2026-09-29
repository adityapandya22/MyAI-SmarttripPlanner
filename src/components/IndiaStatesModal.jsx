import { useState, useMemo } from 'react'
import {
  X, Search, MapPin, Calendar, Clock, Sparkles, Compass,
} from 'lucide-react'
import { INDIA_STATES, INDIA_REGIONS } from '../data/indiaStates'
import { buildDestinationTrie } from '../lib/trie'
import { useTrip, toast } from '../store'

export default function IndiaStatesModal({ onClose }) {
  const [search, setSearch] = useState('')
  const [selectedRegion, setSelectedRegion] = useState('All')
  const [selectedType, setSelectedType] = useState('All') // 'All', 'State', 'Union Territory'

  const trie = useMemo(() => buildDestinationTrie(INDIA_STATES), [])

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q || q.length < 2) return []
    return trie.autocomplete(q, 6)
  }, [search, trie])

  const createTrip = useTrip((s) => s.createTrip)
  const setCenter = useTrip((s) => s.setCenter)
  const setCurrency = useTrip((s) => s.setCurrency)
  const setCar = useTrip((s) => s.setCar)
  const setBrief = useTrip((s) => s.setBrief)

  const filteredStates = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) {
      return INDIA_STATES.filter((item) => {
        if (selectedRegion !== 'All' && item.region !== selectedRegion) return false
        if (selectedType !== 'All' && item.type !== selectedType) return false
        return true
      })
    }
    const sugStateIds = new Set(trie.autocomplete(q, 15).map((s) => s.meta?.stateId).filter(Boolean))
    return INDIA_STATES.filter((item) => {
      if (selectedRegion !== 'All' && item.region !== selectedRegion) return false
      if (selectedType !== 'All' && item.type !== selectedType) return false
      return (
        sugStateIds.has(item.id) ||
        item.name.toLowerCase().includes(q) ||
        item.capital.toLowerCase().includes(q) ||
        item.topAttractions.some((a) => (typeof a === 'string' ? a : a.name).toLowerCase().includes(q)) ||
        item.tagline.toLowerCase().includes(q)
      )
    })
  }, [search, selectedRegion, selectedType, trie])

  const handlePlanTrip = (state) => {
    // Create new trip with interview phase & INR currency
    createTrip(`Trip to ${state.name}`, 'interview')
    setCenter(state.coords)
    setCurrency('INR')
    setCar({ gasUnit: 'inr_l' })
    setBrief(state.promptTemplate)
    toast(`Planning trip to ${state.name} with Ulisse (in ₹ INR)`)
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6 backdrop-blur-sm anim-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-3xl bg-white shadow-2xl overflow-hidden border border-ink-100">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-orange-500 via-amber-500 to-emerald-600 px-6 py-5 text-white">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl filter drop-shadow">🇮🇳</span>
              <div>
                <h2 className="font-display text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  Explore Incredible India
                  <span className="text-xs bg-white/20 backdrop-blur-md px-2.5 py-0.5 rounded-full font-semibold">
                    28 States · 8 UTs
                  </span>
                </h2>
                <p className="text-xs text-orange-100">
                  Select any state or union territory to plan a personalized trip with Ulisse in Indian Rupees (₹)
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-full bg-white/20 p-2 text-white hover:bg-white/30 transition backdrop-blur-md"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Quick search and filters bar */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-orange-950/60" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search state, capital, or landmark (e.g. Taj Mahal, Hampi, Manali)..."
                className="w-full rounded-xl bg-white/95 pl-9 pr-4 py-2 text-xs sm:text-sm font-medium text-ink-800 placeholder:text-ink-400 outline-none shadow-sm focus:ring-2 focus:ring-white"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Type selector */}
            <div className="flex rounded-xl bg-white/20 p-0.5 text-xs font-semibold backdrop-blur-md">
              {['All', 'State', 'Union Territory'].map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`rounded-lg px-2.5 py-1.5 transition ${
                    selectedType === type ? 'bg-white text-orange-900 shadow-sm' : 'text-white hover:bg-white/10'
                  }`}
                >
                  {type === 'Union Territory' ? 'UTs (8)' : type === 'State' ? 'States (28)' : 'All (36)'}
                </button>
              ))}
            </div>
          </div>

          {/* Trie Autocomplete Suggestions */}
          {suggestions.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs anim-fade-in">
              <span className="text-orange-100 text-[11px] font-semibold flex items-center gap-1">
                <Sparkles size={12} className="text-amber-200" /> Suggestions:
              </span>
              {suggestions.map((sug, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    const st = INDIA_STATES.find((s) => s.id === sug.meta?.stateId)
                    if (st) setSearch(st.name)
                    else setSearch(sug.term)
                  }}
                  className="rounded-lg bg-white/20 hover:bg-white/35 px-2 py-0.5 text-[11px] font-medium text-white transition backdrop-blur-md border border-white/20 capitalize"
                >
                  {sug.term}
                  {sug.meta?.stateName && sug.meta.stateName.toLowerCase() !== sug.term.toLowerCase() && (
                    <span className="ml-1 opacity-75 text-[10px]">({sug.meta.stateName})</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Region pills */}
          <div className="mt-3 flex flex-wrap gap-1.5 overflow-x-auto text-[11px] pb-1 font-medium">
            {INDIA_REGIONS.map((region) => (
              <button
                key={region}
                onClick={() => setSelectedRegion(region)}
                className={`rounded-lg px-2.5 py-1 transition ${
                  selectedRegion === region
                    ? 'bg-white text-orange-800 font-bold shadow-sm'
                    : 'bg-black/15 text-white/90 hover:bg-black/25'
                }`}
              >
                {region}
              </button>
            ))}
          </div>
        </div>

        {/* Content Body: Grid of States */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-ink-50/50">
          <div className="mb-3 flex items-center justify-between text-xs text-ink-500 px-1 font-medium">
            <span>Showing {filteredStates.length} destinations</span>
            <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              <span className="font-bold">₹ INR</span> Currency Supported
            </span>
          </div>

          {filteredStates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-ink-400">
              <Compass size={40} className="mb-3 text-ink-300 stroke-[1.5]" />
              <p className="font-semibold text-ink-600">No states or territories found</p>
              <p className="text-xs">Try clearing the search query or selecting "All" regions</p>
              <button
                onClick={() => { setSearch(''); setSelectedRegion('All'); setSelectedType('All') }}
                className="mt-4 rounded-xl bg-orange-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-orange-700 transition"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredStates.map((item) => (
                <div
                  key={item.id}
                  className="group flex flex-col justify-between rounded-2xl border border-ink-200/80 bg-white p-4 shadow-sm transition hover:border-orange-300 hover:shadow-md hover:-translate-y-0.5"
                >
                  <div>
                    {/* Top Row: Title + Type & Region Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display text-base font-bold text-ink-900 group-hover:text-orange-600 transition">
                          {item.name}
                        </h3>
                        <p className="text-[11px] font-medium text-ink-500 flex items-center gap-1 mt-0.5">
                          <MapPin size={11} className="text-orange-500 shrink-0" />
                          <span className="truncate">Capital: {item.capital}</span>
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          item.type === 'State' ? 'bg-orange-50 text-orange-700 border border-orange-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {item.type}
                        </span>
                        <span className="text-[10px] font-semibold text-ink-400 bg-ink-100 px-1.5 py-0.5 rounded">
                          {item.region}
                        </span>
                      </div>
                    </div>

                    {/* Tagline */}
                    <p className="mt-2.5 text-xs text-ink-600 line-clamp-2 leading-relaxed">
                      {item.tagline}
                    </p>

                    {/* Top Attractions Tags */}
                    <div className="mt-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1">Top Highlights</p>
                      <div className="flex flex-wrap gap-1">
                        {item.topAttractions.slice(0, 3).map((att) => {
                          const name = typeof att === 'string' ? att : att.name
                          return (
                            <span
                              key={name}
                              className="inline-block rounded-md bg-ink-100/70 px-1.5 py-0.5 text-[10px] font-medium text-ink-700 truncate max-w-[200px]"
                              title={name}
                            >
                              {name}
                            </span>
                          )
                        })}
                        {item.topAttractions.length > 3 && (
                          <span className="text-[10px] text-ink-400 font-semibold self-center">
                            +{item.topAttractions.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Footer: Season + Days + Plan Button */}
                  <div className="mt-4 pt-3 border-t border-ink-100 flex items-center justify-between gap-2">
                    <div className="text-[11px] text-ink-500 space-y-0.5">
                      <div className="flex items-center gap-1 text-[10px]">
                        <Clock size={11} className="text-amber-500" />
                        <span>~{item.suggestedDays} days suggested</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-ink-400">
                        <Calendar size={11} className="text-blue-500" />
                        <span className="truncate max-w-[120px]" title={item.bestTime}>{item.bestTime}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handlePlanTrip(item)}
                      className="flex items-center gap-1 rounded-xl bg-orange-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-orange-700 active:scale-95 shrink-0"
                    >
                      <Sparkles size={12} className="text-amber-200" />
                      Plan in ₹
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="border-t border-ink-200 bg-white px-6 py-3 flex items-center justify-between text-xs text-ink-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink-700">Ulisse Trip Planner</span>
            <span>· All prices and fuel estimates calculated in ₹ (INR)</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1 font-semibold text-ink-600 hover:bg-ink-100 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
