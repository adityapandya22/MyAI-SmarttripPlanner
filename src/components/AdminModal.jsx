import { useState, useEffect } from 'react'
import {
  ShieldCheck, Lock, Key, Server, Cpu, CheckCircle2, AlertCircle,
  LogOut, ExternalLink, Sparkles, Eye, EyeOff, Save, Compass,
} from 'lucide-react'
import Modal from './Modal'
import { useTrip, toast } from '../store'
import { useAgentChat, sendAdminMessage } from '../agent/socket'

export default function AdminModal({ open, onClose }) {
  /* guard: do not mount anything when the modal is closed */
  if (!open) return null

  return <AdminModalInner open={open} onClose={onClose} />
}

function AdminModalInner({ open, onClose }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [tab, setTab] = useState('keys') // 'keys' | 'trips' | 'system'

  // Check server auth state on mount/open
  useEffect(() => {
    if (!open) return
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.user?.role === 'admin') {
          setIsAdmin(true)
        } else {
          setIsAdmin(false)
        }
      })
      .catch(() => setIsAdmin(false))
  }, [open])

  // Admin Config State
  const [geminiKey, setGeminiKey] = useState('')
  const [groqKey, setGroqKey] = useState('')
  const [defaultEngine, setDefaultEngine] = useState('free')
  const [hasGemini, setHasGemini] = useState(false)
  const [hasGroq, setHasGroq] = useState(false)
  const [geminiPreview, setGeminiPreview] = useState('')
  const [groqPreview, setGroqPreview] = useState('')
  const [showGemini, setShowGemini] = useState(false)
  const [showGroq, setShowGroq] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverMsg, setServerMsg] = useState('')

  const trips = useTrip((s) => s.trips)
  const connected = useAgentChat((s) => s.connected)

  // Request current backend configuration via WebSocket
  useEffect(() => {
    if (!open || !isAdmin) return
    const handleConfigEvent = (e) => {
      const msg = e.detail
      if (!msg) return
      setHasGemini(msg.hasGeminiKey)
      setHasGroq(msg.hasGroqKey)
      setGeminiPreview(msg.geminiKeyPreview || '')
      setGroqPreview(msg.groqKeyPreview || '')
      if (msg.defaultEngine) setDefaultEngine(msg.defaultEngine)
      if (msg.saved) {
        setSaving(false)
        setServerMsg('Settings saved successfully to server!')
        setTimeout(() => setServerMsg(''), 3000)
      }
    }

    window.addEventListener('ulisse:admin_config', handleConfigEvent)
    sendAdminMessage({ type: 'admin_get_config' })

    return () => {
      window.removeEventListener('ulisse:admin_config', handleConfigEvent)
    }
  }, [open, isAdmin])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError('')
    try {
      const res = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'fetch',
        },
        body: JSON.stringify({ email: username.trim(), password }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setIsAdmin(true)
        setLoginError('')
        toast('Welcome to Administrative Control Center')
      } else {
        setLoginError(data.error || 'Invalid administrator credentials')
      }
    } catch {
      setLoginError('Failed to communicate with authentication server')
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'X-Requested-With': 'fetch' },
      })
    } catch {
      // ignore
    }
    setIsAdmin(false)
    setPassword('')
    toast('Logged out from Admin. Switched to Consumer Mode.')
  }

  const handleSaveConfig = () => {
    setSaving(true)
    const payload = {
      type: 'admin_set_config',
      defaultEngine,
    }
    if (geminiKey.trim()) payload.geminiKey = geminiKey.trim()
    if (groqKey.trim()) payload.groqKey = groqKey.trim()

    // Send via socket
    sendAdminMessage(payload)

    // Also persist default consumer engine in localStorage for immediate effect
    localStorage.setItem('agent.default_consumer_engine', defaultEngine)
    if (geminiKey.trim()) localStorage.setItem('agent.key.gemini', geminiKey.trim())
    if (groqKey.trim()) localStorage.setItem('agent.key.groq', groqKey.trim())

    toast('Configuration updated and saved to server!')
    setTimeout(() => setSaving(false), 600)
  }

  return (
    <Modal open={open} onClose={onClose} title="Administrative Control Center" maxWidth="max-w-2xl">
      {!isAdmin ? (
        /* Login Screen */
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/25">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-ink-900">Administrator Sign In</h3>
              <p className="text-xs text-ink-500">
                Manage backend AI API keys, consumer engines, and system defaults.
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-500 mb-1">
                Admin Email / Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin@mytripplanner.local"
                className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-2.5 text-sm font-medium text-ink-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-500 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter administrator password"
                className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-2.5 text-sm font-medium text-ink-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {loginError && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                <AlertCircle size={15} />
                <span>{loginError}</span>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-500 hover:bg-ink-100 transition"
              >
                Cancel (Stay in Consumer Mode)
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-600/25 hover:bg-indigo-700 active:scale-95 transition"
              >
                <Lock size={15} />
                <span>Sign In as Admin</span>
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Authenticated Admin Dashboard */
        <div className="flex flex-col h-full">
          {/* Top Banner */}
          <div className="border-b border-ink-100 bg-indigo-50/70 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-xs font-bold text-indigo-950">
                Administrative Mode Active
              </p>
              <span className="text-[11px] text-indigo-600">· Changes apply to all consumers automatically</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition"
              title="Logout from admin mode"
            >
              <LogOut size={12} />
              <span>Logout</span>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-ink-200 px-5 bg-white text-xs font-bold text-ink-500">
            <button
              onClick={() => setTab('keys')}
              className={`py-3 px-3 border-b-2 flex items-center gap-2 transition ${
                tab === 'keys' ? 'border-indigo-600 text-indigo-600' : 'border-transparent hover:text-ink-800'
              }`}
            >
              <Key size={14} />
              <span>API Keys & Consumer Engine</span>
            </button>
            <button
              onClick={() => setTab('trips')}
              className={`py-3 px-3 border-b-2 flex items-center gap-2 transition ${
                tab === 'trips' ? 'border-indigo-600 text-indigo-600' : 'border-transparent hover:text-ink-800'
              }`}
            >
              <Compass size={14} />
              <span>Consumer Trips ({trips.length})</span>
            </button>
            <button
              onClick={() => setTab('system')}
              className={`py-3 px-3 border-b-2 flex items-center gap-2 transition ${
                tab === 'system' ? 'border-indigo-600 text-indigo-600' : 'border-transparent hover:text-ink-800'
              }`}
            >
              <Server size={14} />
              <span>System & Regions</span>
            </button>
          </div>

          {/* Tab Contents */}
          <div className="p-5 sm:p-6 overflow-y-auto max-h-[65vh] space-y-6">
            {tab === 'keys' && (
              <>
                {/* Info Card */}
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs">
                    <Sparkles size={16} className="text-emerald-600" />
                    <span>Zero-Friction Consumer Guarantee</span>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-emerald-800">
                    Any API key configured here powers consumer trip generation on the backend. Your consumers simply type their prompt and get instant itineraries in ₹ INR — they never need to sign in or get an API key.
                  </p>
                </div>

                {/* Consumer Default Engine */}
                <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">
                        Default Engine for Consumers
                      </h4>
                      <p className="text-xs text-ink-500">Select which AI brain processes consumer trip requests</p>
                    </div>
                    <Cpu size={18} className="text-indigo-600" />
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => setDefaultEngine('free')}
                      className={`rounded-xl border p-3 text-left transition ${
                        defaultEngine === 'free'
                          ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                          : 'border-ink-200 hover:border-ink-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-900">⚡ Autonomous Local</span>
                        {defaultEngine === 'free' && <CheckCircle2 size={14} className="text-emerald-600" />}
                      </div>
                      <p className="mt-1 text-[11px] text-ink-500">100% Free · 0 API keys · Instant trip planner</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDefaultEngine('gemini')}
                      className={`rounded-xl border p-3 text-left transition ${
                        defaultEngine === 'gemini'
                          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                          : 'border-ink-200 hover:border-ink-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-900">🔑 Google Gemini</span>
                        {defaultEngine === 'gemini' && <CheckCircle2 size={14} className="text-blue-600" />}
                      </div>
                      <p className="mt-1 text-[11px] text-ink-500">Gemini 2.0 Flash · Uses server key · 100% Free Tier</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDefaultEngine('groq')}
                      className={`rounded-xl border p-3 text-left transition ${
                        defaultEngine === 'groq'
                          ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500'
                          : 'border-ink-200 hover:border-ink-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-purple-900">🚀 Groq LLaMA 3.3</span>
                        {defaultEngine === 'groq' && <CheckCircle2 size={14} className="text-purple-600" />}
                      </div>
                      <p className="mt-1 text-[11px] text-ink-500">Ultra-fast open weights · 70B parameters</p>
                    </button>
                  </div>
                </div>

                {/* Google Gemini Key */}
                <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-blue-500" />
                      <h4 className="text-xs font-bold text-ink-900">Google Gemini API Key</h4>
                    </div>
                    {hasGemini ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                        <CheckCircle2 size={11} /> Configured
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-700 ring-1 ring-amber-200">
                        Not Set (Using Local Planner)
                      </span>
                    )}
                  </div>

                  {geminiPreview && (
                    <p className="text-[11px] text-ink-400 font-mono">
                      Current Server Key: {geminiPreview}
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showGemini ? 'text' : 'password'}
                        value={geminiKey}
                        onChange={(e) => setGeminiKey(e.target.value)}
                        placeholder="Paste new Gemini API Key (starts with AIzaSy...)"
                        className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-2 font-mono text-xs text-ink-900 outline-none transition focus:border-blue-500 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGemini(!showGemini)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
                      >
                        {showGemini ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline font-semibold"
                    >
                      <span>Get 100% Free Gemini Key from Google AI Studio</span>
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </div>

                {/* Groq Key */}
                <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-purple-500" />
                      <h4 className="text-xs font-bold text-ink-900">Groq Cloud API Key</h4>
                    </div>
                    {hasGroq ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                        <CheckCircle2 size={11} /> Configured
                      </span>
                    ) : (
                      <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-bold text-ink-500">
                        Optional
                      </span>
                    )}
                  </div>

                  {groqPreview && (
                    <p className="text-[11px] text-ink-400 font-mono">
                      Current Server Key: {groqPreview}
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showGroq ? 'text' : 'password'}
                        value={groqKey}
                        onChange={(e) => setGroqKey(e.target.value)}
                        placeholder="Paste Groq API Key (starts with gsk_...)"
                        className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-2 font-mono text-xs text-ink-900 outline-none transition focus:border-purple-500 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGroq(!showGroq)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
                      >
                        {showGroq ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <a
                      href="https://console.groq.com/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-purple-600 hover:underline font-semibold"
                    >
                      <span>Get 100% Free Groq Key from Groq Console</span>
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </div>

                {serverMsg && (
                  <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-center">
                    {serverMsg}
                  </p>
                )}

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveConfig}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-600/25 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 transition"
                  >
                    <Save size={15} />
                    <span>{saving ? 'Saving...' : 'Save Configuration for All Consumers'}</span>
                  </button>
                </div>
              </>
            )}

            {tab === 'trips' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">
                    Consumer Itineraries in Database
                  </h4>
                  <span className="text-xs font-bold text-ink-700">Total: {trips.length} Trips</span>
                </div>

                {trips.length === 0 ? (
                  <p className="text-xs text-ink-400 text-center py-6">
                    No consumer trips created yet. Trips will appear here as consumers plan them.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {trips.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between rounded-xl border border-ink-200 bg-white p-3 hover:border-indigo-300 transition"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-ink-900 truncate">{t.title || 'Untitled Journey'}</p>
                          <p className="text-[11px] text-ink-500">
                            {t.days?.length || 0} Days · Currency: {t.currency || 'INR'} (₹)
                          </p>
                        </div>
                        <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          {t.phase === 'interview' ? 'Interview' : 'Active Planner'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'system' && (
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">
                  System Diagnostics & India Config
                </h4>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-ink-200 bg-white p-3.5 space-y-1">
                    <p className="text-[11px] text-ink-400 font-semibold uppercase">WebSocket Hub</p>
                    <div className="flex items-center gap-1.5">
                      <span className={`size-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      <p className="text-xs font-bold text-ink-800">{connected ? 'Connected (:5200)' : 'Connecting...'}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-ink-200 bg-white p-3.5 space-y-1">
                    <p className="text-[11px] text-ink-400 font-semibold uppercase">Default Currency</p>
                    <p className="text-xs font-bold text-emerald-700">₹ Indian Rupee (INR)</p>
                  </div>

                  <div className="rounded-xl border border-ink-200 bg-white p-3.5 space-y-1">
                    <p className="text-[11px] text-ink-400 font-semibold uppercase">India Destinations</p>
                    <p className="text-xs font-bold text-ink-800">36 States & Union Territories (Complete)</p>
                  </div>

                  <div className="rounded-xl border border-ink-200 bg-white p-3.5 space-y-1">
                    <p className="text-[11px] text-ink-400 font-semibold uppercase">Scraper Provider</p>
                    <p className="text-xs font-bold text-indigo-700">Instant Mock + Scraper Fallback</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
