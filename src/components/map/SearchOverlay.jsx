import { useEffect, useRef, useState } from 'react'
import {
  Search, X, Navigation, ArrowUpDown, Crosshair, Loader2, ChevronDown,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAgentChat } from '../../agent/socket'
import { toast } from '../../store'
import { searchPlaces } from '../../lib/geo'
import { fmtKm } from '../../lib/utils'
import { fmtMin } from './mapUtils'

export default function SearchOverlay({
  dir,
  setDir,
  route,
  routing,
  dirPick,
  setDirPick,
  onSelectPlace,
  onCloseDirections,
}) {
  const { t } = useTranslation()
  const [showSteps, setShowSteps] = useState(false)
  /* on a squeezed map (itinerary + chat both open) the 320px box would sit
     on top of the filter chips: collapse it to a single icon until asked.
     The map is a fullscreen background: both floating panels cover it, so
     the VISIBLE width is the host minus the itinerary column (--left-w,
     desktop only) and the chat shift. */
  const chatShift = useAgentChat((s) => (s.open ? s.panelW : 0))
  const wrapRef = useRef(null)
  const [narrow, setNarrow] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const el = wrapRef.current
    const host = el?.offsetParent
    if (!host) return
    const update = () => {
      const leftW = window.matchMedia('(min-width: 1024px)').matches
        ? parseInt(getComputedStyle(el).getPropertyValue('--left-w')) || 0
        : 0
      setNarrow(host.clientWidth - leftW - chatShift < 600)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(host)
    return () => ro.disconnect()
  }, [chatShift])

  const handleSelectPlace = (p) => {
    onSelectPlace(p, narrow, setExpanded)
  }

  const handleCloseDirections = () => {
    onCloseDirections(setShowSteps)
  }

  if (narrow && !expanded && !dir.open) {
    return (
      <div ref={wrapRef} className="absolute right-[calc(0.75rem+var(--chat-w,0px))] top-[var(--hdr-b,96px)] z-[520] transition-[right] duration-200">
        <button
          onClick={() => setExpanded(true)}
          title={t('map.search.open')}
          aria-label={t('map.search.open')}
          aria-expanded={false}
          className="grid size-10 place-items-center rounded-2xl border border-ink-200 bg-white text-ink-500 shadow-lg transition hover:border-brand-300 hover:text-brand-600"
        >
          <Search size={16} />
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="absolute right-[calc(0.75rem+var(--chat-w,0px))] top-[var(--hdr-b,96px)] z-[520] w-80 max-w-[calc(100vw-24px)] transition-[right] duration-200 lg:top-[var(--hdr-b,96px)]">
      <div className="nice-scroll max-h-[calc(100dvh-150px)] overflow-y-auto rounded-2xl border border-ink-200 bg-white shadow-lg">
        {!dir.open ? (
          /* --- simple place search --- */
          <div className="flex items-start gap-1 p-1.5">
            <PlaceSearch
              placeholder={t('map.search.placeholder')}
              onSelect={handleSelectPlace}
              autoClear={false}
              autoFocus={narrow}
            />
            <button
              onClick={() => setDir((d) => ({ ...d, open: true }))}
              title={t('map.dir.roadDirections')}
              aria-label={t('map.dir.roadDirections')}
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-sm transition hover:bg-blue-700"
            >
              <Navigation size={15} />
            </button>
            {narrow && (
              <button
                onClick={() => setExpanded(false)}
                title={t('map.search.close')}
                aria-label={t('map.search.close')}
                className="grid size-9 shrink-0 place-items-center rounded-xl text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
              >
                <X size={15} />
              </button>
            )}
          </div>
        ) : (
          /* --- directions panel --- */
          <div className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 font-display text-[13px] font-bold text-ink-900">
                <Navigation size={13} className="text-blue-600" /> {t('map.dir.directions')}
              </h4>
              <button onClick={handleCloseDirections} aria-label={t('map.dir.close')} className="grid size-7 place-items-center rounded-lg text-ink-400 transition hover:bg-ink-100">
                <X size={15} />
              </button>
            </div>

            <div className="flex items-stretch gap-2">
              <div className="flex flex-col items-center justify-center gap-1 py-1">
                <span className="size-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-200" />
                <span className="w-px flex-1 border-l-2 border-dotted border-ink-300" />
                <span className="size-2.5 rounded-full bg-rose-500 ring-2 ring-rose-200" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Endpoint
                  value={dir.a}
                  placeholder={t('map.dir.fromPlaceholder')}
                  picking={dirPick === 'a'}
                  onPick={() => setDirPick(dirPick === 'a' ? null : 'a')}
                  onSelect={(p) => setDir((d) => ({ ...d, a: p }))}
                  onClear={() => setDir((d) => ({ ...d, a: null }))}
                />
                <Endpoint
                  value={dir.b}
                  placeholder={t('map.dir.toPlaceholder')}
                  picking={dirPick === 'b'}
                  onPick={() => setDirPick(dirPick === 'b' ? null : 'b')}
                  onSelect={(p) => setDir((d) => ({ ...d, b: p }))}
                  onClear={() => setDir((d) => ({ ...d, b: null }))}
                />
              </div>
              <button
                onClick={() => setDir((d) => ({ ...d, a: d.b, b: d.a }))}
                title={t('map.dir.swap')}
                aria-label={t('map.dir.swap')}
                className="grid w-8 shrink-0 place-items-center self-center rounded-lg text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
              >
                <ArrowUpDown size={15} />
              </button>
            </div>

            {dirPick && (
              <p className="mt-2 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700">
                {dirPick === 'a' ? t('map.dir.clickToSetStart') : t('map.dir.clickToSetEnd')}
              </p>
            )}

            {routing && (
              <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-ink-500">
                <Loader2 size={14} className="animate-spin text-blue-600" /> {t('map.dir.calculating')}
              </div>
            )}

            {route && !routing && (
              <div className="mt-3 border-t border-ink-100 pt-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-lg font-extrabold text-blue-700">{fmtMin(route.min, t)}</span>
                  <span className="text-xs font-semibold text-ink-500">({fmtKm(route.km)})</span>
                </div>
                <button
                  onClick={() => setShowSteps((s) => !s)}
                  className="mt-1 flex items-center gap-1 text-[11.5px] font-bold text-blue-600 hover:underline"
                >
                  <ChevronDown size={12} className={`transition-transform ${showSteps ? 'rotate-180' : ''}`} />
                  {showSteps ? t('map.dir.hideSteps') : t('map.dir.showSteps', { count: route.steps.length })}
                </button>
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                    showSteps ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                  }`}
                >
                  <div className="overflow-hidden">
                    <ol className="nice-scroll mt-2 max-h-56 overflow-y-auto">
                      {route.steps.map((s, i) => (
                        <li key={i} className="flex items-start gap-2.5 border-b border-ink-100 py-1.5 last:border-0">
                          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ink-100 text-[10px] font-bold text-ink-500">
                            {i + 1}
                          </span>
                          <span className="min-w-0 flex-1 text-xs leading-snug text-ink-700">{s.text}</span>
                          {s.km >= 0.05 && (
                            <span className="shrink-0 text-[10.5px] font-semibold tabular-nums text-ink-400">
                              {s.km < 1 ? `${Math.round(s.km * 1000)} m` : `${s.km.toFixed(1)} km`}
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Endpoint({ value, placeholder, picking, onPick, onSelect, onClear }) {
  const { t } = useTranslation()
  if (value) {
    return (
      <div className="flex h-9 min-w-0 items-center gap-1.5 rounded-xl bg-ink-50 px-2.5 ring-1 ring-ink-200">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-800" title={value.name}>
          {value.short || value.name}
        </span>
        <button onClick={onClear} aria-label={t('map.dir.remove')} className="shrink-0 text-ink-400 transition hover:text-rose-600">
          <X size={13} strokeWidth={2.8} />
        </button>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-1">
      <PlaceSearch placeholder={placeholder} onSelect={onSelect} autoClear small />
      <button
        onClick={onPick}
        title={t('map.dir.pickOnMap')}
        aria-label={`${t('map.dir.pickOnMap')}: ${placeholder}`}
        className={`grid size-8 shrink-0 place-items-center rounded-lg transition ${
          picking ? 'bg-blue-600 text-white' : 'text-ink-400 hover:bg-ink-100 hover:text-ink-700'
        }`}
      >
        <Crosshair size={14} />
      </button>
    </div>
  )
}

function PlaceSearch({ placeholder, onSelect, autoClear, small, autoFocus }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    const query = q.trim()
    if (!query) return
    setBusy(true)
    try {
      const r = await searchPlaces(query)
      setResults(r)
      if (!r.length) toast(t('map.search.noResults'))
    } catch {
      toast(t('map.search.networkError'))
    } finally {
      setBusy(false)
    }
  }

  const pick = (p) => {
    setResults(null)
    setQ(autoClear ? '' : p.short)
    onSelect(p)
  }

  return (
    <div className="min-w-0 flex-1">
      <div className={`flex items-center gap-1.5 rounded-xl bg-ink-50 px-2.5 ring-1 ring-ink-200 transition focus-within:ring-blue-400 ${small ? 'h-8' : 'h-9'}`}>
        <Search size={13} className="shrink-0 text-ink-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run() } }}
          placeholder={placeholder}
          aria-label={placeholder}
          autoFocus={autoFocus}
          className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-ink-800 outline-none placeholder:font-normal placeholder:text-ink-400"
        />
        {busy
          ? <Loader2 size={13} className="shrink-0 animate-spin text-blue-600" />
          : q && (
            <button onClick={() => { setQ(''); setResults(null) }} aria-label={t('map.search.clear')} className="shrink-0 text-ink-300 hover:text-ink-600">
              <X size={12} strokeWidth={3} />
            </button>
          )}
      </div>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          results?.length ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="nice-scroll mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-ink-100 bg-ink-50/50 p-1">
            {(results ?? []).map((p, i) => (
              <button
                key={i}
                onClick={() => pick(p)}
                className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-white hover:shadow-sm"
              >
                <Search size={11} className="mt-0.5 shrink-0 text-ink-300" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-ink-800">{p.short}</span>
                  <span className="line-clamp-1 text-[10.5px] text-ink-400">{p.name}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
