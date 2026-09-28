import { useRef, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Palmtree, Plus, Copy, Trash2, Upload, MapPin, CalendarDays, CarFront, ChevronRight, Route, Wallet,
  ShieldCheck, Sparkles,
} from 'lucide-react'
import { useTrip, useUI, toast } from '../store'
import { tripStats, fmtDur, dayDate, fmtDate, fmtKm, fmtMoney, costByType, fuelCost, toTitleCase } from '../lib/utils'
import { chainedDayCoords, estimateDayKm } from '../lib/geo'
import { internTripImages } from '../lib/imgdb'
import { useItemImages } from './ItemImage'
import ConfirmDialog from './ConfirmDialog'
import Toast from './Toast'
import LanguageSwitcher from './LanguageSwitcher'
import { StorageSetupCard, StorageSettingsRow } from './StorageCard'
import IndiaStatesModal from './IndiaStatesModal'
import AdminModal from './AdminModal'
import { useAgentChat } from '../agent/socket'
import { INDIA_STATES } from '../data/indiaStates'
import { buildDestinationTrie } from '../lib/trie'

export default function Dashboard() {
  const { t } = useTranslation()
  const trips = useTrip((s) => s.trips)
  const openTrip = useTrip((s) => s.openTrip)
  const createTrip = useTrip((s) => s.createTrip)
  const deleteTrip = useTrip((s) => s.deleteTrip)
  const duplicateTrip = useTrip((s) => s.duplicateTrip)
  const importNewTrip = useTrip((s) => s.importNewTrip)
  const ask = useUI((s) => s.ask)
  const fileRef = useRef(null)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [showIndiaModal, setShowIndiaModal] = useState(false)
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [consumerPrompt, setConsumerPrompt] = useState('')

  const destTrie = useMemo(() => buildDestinationTrie(INDIA_STATES), [])

  const promptSuggestions = useMemo(() => {
    const q = consumerPrompt.trim().toLowerCase()
    if (!q || q.length < 2) return []
    const words = q.split(/\s+/)
    const lastWord = words[words.length - 1]
    return lastWord.length >= 2 ? destTrie.autocomplete(lastWord, 5) : destTrie.autocomplete(q, 5)
  }, [consumerPrompt, destTrie])

  const handleConsumerQuickPlan = (prompt) => {
    const query = (prompt || consumerPrompt).trim()
    if (!query) return
    const rawTitle = query.length > 35 ? query.slice(0, 35) + '…' : query
    const title = toTitleCase(rawTitle)
    createTrip(title, 'interview')
    setTimeout(() => {
      useAgentChat.getState().send(query)
    }, 400)
  }

  /* the primary path: a new trip is born as a conversation with the agent */
  const onCreateWithAgent = () => {
    createTrip(t('store.newTrip'), 'interview')
  }

  /* discreet manual fallback */
  const onCreate = () => {
    createTrip(newTitle.trim())
    setCreating(false)
    setNewTitle('')
    toast(t('dashboard.toasts.created'))
  }

  const onImportFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result)
        if (!Array.isArray(data.days)) throw new Error('bad')
        await internTripImages(data)
        importNewTrip(data)
        toast(t('dashboard.toasts.imported'))
      } catch {
        toast(t('dashboard.toasts.invalidFile'))
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="min-h-full bg-ink-100">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 sm:px-6">
          <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-rose-500 text-white shadow-md shadow-brand-500/25">
            <Palmtree size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="font-display text-xl font-extrabold text-ink-900">{t('dashboard.title')}</h1>
            <p className="text-xs text-ink-500">{t('dashboard.subtitle')}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Consumer Mode</span>
            </div>
            <button
              onClick={() => setShowAdminModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/80 px-3 py-2 text-sm font-bold text-indigo-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-100 active:scale-[.97]"
              title="Open Administrative Control Center (Configure Backend API Keys & AI Engine)"
            >
              <ShieldCheck size={16} className="text-indigo-600" />
              <span className="hidden sm:inline">Admin Portal</span>
            </button>
            <button
              onClick={() => setShowIndiaModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 px-3 py-2 text-sm font-bold text-orange-800 shadow-sm transition hover:border-orange-300 hover:from-orange-100 hover:to-amber-100 active:scale-[.97]"
              title="Explore all 28 States and 8 Union Territories of India in ₹ INR"
            >
              <span className="text-base leading-none">🇮🇳</span>
              <span className="hidden sm:inline">Explore India</span>
              <span className="rounded-full bg-orange-200/80 px-1.5 py-0.2 text-[10px] font-black text-orange-950">36</span>
            </button>
            <LanguageSwitcher />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-600 shadow-sm transition hover:border-ink-300"
            >
              <Upload size={15} /> <span className="hidden sm:inline">{t('dashboard.import')}</span>
            </button>
            <button
              onClick={onCreateWithAgent}
              className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white shadow-md shadow-brand-500/30 transition hover:bg-brand-600 active:scale-[.97]"
            >
              <Plus size={16} strokeWidth={2.6} /> {t('store.newTrip')}
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onImportFile} />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {/* Consumer Instant Trip Generator Hero Banner */}
        <div className="mb-6 overflow-hidden rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-600 via-indigo-600 to-brand-600 p-6 text-white shadow-xl shadow-indigo-600/15">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold tracking-wide text-white backdrop-blur-md">
              <Sparkles size={14} className="text-amber-300" />
              <span>Instant AI Trip Planner · Zero Login · No API Key Needed</span>
            </div>
            <h2 className="mt-3 font-display text-2xl font-black tracking-tight text-white sm:text-3xl">
              Where would you like to travel?
            </h2>
            <p className="mt-1.5 text-xs text-violet-100 sm:text-sm leading-relaxed">
              Type your dream destination or travel style. Ulisse automatically creates the full day-by-day itinerary, suggests verified hotels, and budgets everything in ₹ Rupees.
            </p>

            <form
              onSubmit={(e) => { e.preventDefault(); handleConsumerQuickPlan() }}
              className="mt-4 flex flex-col gap-2 rounded-2xl bg-white p-1.5 shadow-2xl sm:flex-row sm:items-center"
            >
              <input
                type="text"
                value={consumerPrompt}
                onChange={(e) => setConsumerPrompt(e.target.value)}
                placeholder="e.g. Plan a 5-day road trip across Rajasthan with heritage stays and palaces in ₹ INR..."
                className="w-full min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm font-medium text-ink-900 outline-none placeholder:text-ink-400"
              />
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-violet-600/30 transition hover:bg-violet-700 active:scale-95 sm:w-auto"
              >
                <Sparkles size={16} />
                <span>Generate Itinerary</span>
              </button>
            </form>

            {/* Trie Destination Autocomplete Suggestions */}
            {promptSuggestions.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs anim-fade-in">
                <span className="text-violet-200 text-[11px] font-semibold flex items-center gap-1">
                  <Sparkles size={12} className="text-amber-300" /> Autocomplete:
                </span>
                {promptSuggestions.map((sug, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      const st = INDIA_STATES.find((s) => s.id === sug.meta?.stateId)
                      const fillText = st?.promptTemplate || `Plan a trip to ${sug.term} with hotels and dining in ₹ INR`
                      setConsumerPrompt(fillText)
                    }}
                    className="rounded-lg bg-white/20 hover:bg-white/30 px-2.5 py-0.5 text-[11px] font-medium text-white transition backdrop-blur-md border border-white/20 capitalize"
                  >
                    {sug.term}
                    {sug.meta?.stateName && sug.meta.stateName.toLowerCase() !== sug.term.toLowerCase() && (
                      <span className="ml-1 opacity-75 text-[10px]">({sug.meta.stateName})</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-violet-200">Instant trip ideas:</span>
              {[
                '🏰 5 Days in Rajasthan',
                '🌴 Kerala Backwaters Tour',
                '🏖️ 4 Days in Goa with Beach Stays',
                '🏔️ Himachal Road Trip to Shimla',
                '🌸 Kashmir Paradise Tour',
                '🏛️ Varanasi Spiritual Heritage',
              ].map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => handleConsumerQuickPlan(idea.replace(/^[^\s]+\s/, ''))}
                  className="rounded-lg bg-white/15 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-white/25 active:scale-95"
                >
                  {idea}
                </button>
              ))}
            </div>
          </div>
        </div>

        <StorageSetupCard />

        {/* Explore India Discovery Banner */}
        <div className="mb-5 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-orange-200/90 bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-emerald-500/10 p-4 sm:p-5 shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-2xl shadow-md shadow-orange-500/25">
              🇮🇳
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base font-extrabold text-ink-900">
                  Plan Trips Across India in Rupees (₹)
                </h3>
                <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-800 border border-orange-200">
                  28 States + 8 UTs
                </span>
              </div>
              <p className="text-xs text-ink-600 mt-0.5">
                From Himalayan peaks in Himachal to Kerala backwaters and Rajasthan palaces — explore all 36 Indian destinations with Ulisse.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowIndiaModal(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-md shadow-orange-600/30 transition hover:bg-orange-700 active:scale-[.97]"
          >
            Explore India States →
          </button>
        </div>
        {creating && (
          <div className="anim-fade-up mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-brand-200 bg-white p-4 shadow-sm">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onCreate(); if (e.key === 'Escape') setCreating(false) }}
              placeholder={t('dashboard.newTripPlaceholder')}
              className="min-w-0 flex-1 rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-ink-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
            />
            <button onClick={() => setCreating(false)} className="rounded-xl border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-600 transition hover:bg-ink-50">
              {t('common.cancel')}
            </button>
            <button onClick={onCreate} className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-500/30 transition hover:bg-brand-600">
              {t('dashboard.create')}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              onOpen={() => openTrip(trip.id)}
              onDuplicate={() => { duplicateTrip(trip.id); toast(t('dashboard.toasts.duplicated')) }}
              onDelete={() =>
                ask(t('dashboard.confirmDelete', { title: trip.title }), () => {
                  deleteTrip(trip.id)
                  toast(t('dashboard.toasts.deleted'))
                })
              }
            />
          ))}

          <button
            onClick={onCreateWithAgent}
            className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-300 font-display text-sm font-bold text-ink-400 transition hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-600"
          >
            <Plus size={24} strokeWidth={2.4} />
            {t('store.newTrip')}
            <span className="font-sans text-[11px] font-medium text-ink-400">{t('dashboard.agentHint')}</span>
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-ink-400">
          {t('dashboard.fromScratch')}{' '}
          <button
            onClick={() => setCreating(true)}
            className="font-semibold text-ink-500 underline decoration-ink-300 underline-offset-2 transition hover:text-ink-700"
          >
            {t('dashboard.createManually')}
          </button>
        </p>

        <StorageSettingsRow />
      </main>

      <ConfirmDialog />
      <Toast />
      {showIndiaModal && <IndiaStatesModal onClose={() => setShowIndiaModal(false)} />}
      <AdminModal open={showAdminModal} onClose={() => setShowAdminModal(false)} />
    </div>
  )
}

function TripCard({ trip, onOpen, onDuplicate, onDelete }) {
  const { t } = useTranslation()
  const stats = tripStats(trip)
  const d0 = dayDate(trip.startDate, 0)
  const dN = dayDate(trip.startDate, trip.days.length - 1)
  const km = chainedDayCoords(trip).reduce((s, l) => s + estimateDayKm(l.coords), 0)
  const budget = costByType(trip).items + fuelCost(km, trip.car, trip.currency ?? 'INR')

  /* cover: first located, non-drive stop */
  const cover = trip.days.flatMap((d) => d.items).find((i) => i.lat != null && i.type !== 'drive')
  const images = useItemImages(cover ?? { lat: null }, !!cover)

  return (
    <article
      onClick={onOpen}
      className="group cursor-pointer overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative h-32 bg-gradient-to-br from-brand-100 via-rose-50 to-sky-100">
        {images[0] && (
          <img src={images[0].url} alt="" loading="lazy" className="anim-fade-in h-full w-full object-cover" />
        )}
        {/* day-color strip */}
        <div className="absolute inset-x-0 bottom-0 flex h-1.5">
          {trip.days.map((d) => (
            <span key={d.id} className="flex-1" style={{ background: d.color }} />
          ))}
        </div>
        <div className="absolute right-2.5 top-2.5 flex gap-1 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
          <CardBtn title={t('dashboard.duplicate')} onClick={onDuplicate}><Copy size={13} /></CardBtn>
          <CardBtn title={t('common.delete')} danger onClick={onDelete}><Trash2 size={13} /></CardBtn>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate font-display text-[15px] font-bold text-ink-900">{trip.title}</h2>
          <ChevronRight size={17} className="shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
        </div>
        {trip.subtitle && <p className="mt-0.5 truncate text-xs text-ink-500">{trip.subtitle}</p>}

        <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] font-semibold text-ink-500">
          <span className="inline-flex items-center gap-1"><CalendarDays size={12} className="text-brand-500" /> {t('dashboard.days', { count: stats.days })}{d0 && dN ? ` · ${fmtDate(d0, { day: 'numeric', month: 'short' })} – ${fmtDate(dN, { day: 'numeric', month: 'short' })}` : ''}</span>
          <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-brand-500" /> {t('dashboard.stops', { count: stats.stops })}</span>
          {stats.driveMin > 0 && <span className="inline-flex items-center gap-1"><CarFront size={12} className="text-brand-500" /> {fmtDur(stats.driveMin)}</span>}
          {km > 50 && <span className="inline-flex items-center gap-1"><Route size={12} className="text-brand-500" /> ~{fmtKm(km)}</span>}
          {budget > 0 && <span className="inline-flex items-center gap-1 text-emerald-700"><Wallet size={12} /> ~{fmtMoney(budget, trip.currency ?? 'INR')}</span>}
        </div>
      </div>
    </article>
  )
}

function CardBtn({ title, onClick, danger, children }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`grid size-7 place-items-center rounded-lg bg-white/90 shadow backdrop-blur transition ${
        danger ? 'text-ink-500 hover:bg-rose-50 hover:text-rose-600' : 'text-ink-500 hover:bg-white hover:text-ink-800'
      }`}
    >
      {children}
    </button>
  )
}
