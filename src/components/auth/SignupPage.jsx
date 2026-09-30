import { useState } from 'react'
import {
  Palmtree, Mail, Lock, Eye, EyeOff, User, MapPin, Compass,
  Wallet, ArrowRight, AlertCircle, Loader2, ArrowLeft
} from 'lucide-react'
import { useAuth } from '../../agent/authStore'
import { navigate, Link } from '../../lib/router'

const TRAVEL_STYLES = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'relaxed', label: 'Relaxed & Scenic' },
  { id: 'adventure', label: 'Adventure & Active' },
  { id: 'cultural', label: 'Cultural & Historic' },
  { id: 'foodie', label: 'Culinary & Local' },
]

const BUDGET_PREFS = [
  { id: 'budget', label: 'Budget ₹', desc: 'Backpacker / Hostels' },
  { id: 'medium', label: 'Standard ₹₹', desc: 'Comfort 3-4★' },
  { id: 'luxury', label: 'Luxury ₹₹₹', desc: 'Boutique & 5★' },
]

export default function SignupPage() {
  const { signup, loginWithGoogle, error: authError, clearError } = useAuth()

  // Form Fields
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [homeCity, setHomeCity] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [travelStyle, setTravelStyle] = useState('balanced')
  const [budgetPref, setBudgetPref] = useState('medium')

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [localError, setLocalError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    clearError()
    setLocalError('')

    // Validation
    if (!fullName.trim()) {
      setLocalError('Please enter your full name.')
      return
    }

    if (!email || !email.includes('@') || !email.includes('.')) {
      setLocalError('Please enter a valid email address.')
      return
    }

    // Phone validation (digits check if provided)
    const cleanPhone = phone.replace(/[^0-9]/g, '')
    if (phone && cleanPhone.length < 10) {
      setLocalError('Please enter a valid 10-digit mobile number for India (+91).')
      return
    }

    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match. Please verify both fields.')
      return
    }

    setIsLoading(true)
    const formattedPhone = cleanPhone ? (cleanPhone.startsWith('91') ? `+${cleanPhone}` : `+91 ${cleanPhone.slice(-10)}`) : ''

    const result = await signup({
      email,
      password,
      fullName: fullName.trim(),
      displayName: fullName.trim(),
      phone: formattedPhone,
      homeCity: homeCity.trim() || 'New Delhi',
      travelStyle,
      budgetPref,
      homeCurrency: 'INR',
      locale: 'en-IN',
    })
    setIsLoading(false)

    if (result.success) {
      navigate('/')
    }
  }

  const handleGoogleSignup = async () => {
    clearError()
    setLocalError('')
    setIsLoading(true)
    const result = await loginWithGoogle({
      email: 'new.traveler@example.com',
      name: 'Google Explorer',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    })
    setIsLoading(false)
    if (result.success) {
      navigate('/')
    }
  }

  const displayError = localError || authError

  return (
    <div className="min-h-full flex flex-col justify-center bg-gradient-to-br from-ink-100 via-brand-50/40 to-ink-50 px-4 py-10 sm:px-6 lg:px-8">
      {/* Return home link */}
      <div className="mx-auto w-full max-w-lg mb-4">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-900 transition-colors"
        >
          <ArrowLeft size={14} /> Back to Planner
        </button>
      </div>

      <div className="mx-auto w-full max-w-lg">
        {/* Card */}
        <div className="rounded-3xl border border-ink-200/80 bg-white/95 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          <div className="flex flex-col items-center text-center">
            <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-rose-500 text-white shadow-lg shadow-brand-500/30 mb-3">
              <Palmtree size={26} strokeWidth={2.4} />
            </div>
            <h1 className="font-display text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
              Create your account
            </h1>
            <p className="mt-1 text-xs text-ink-500 sm:text-sm">
              Join to plan, save, and personalize smart itineraries with Ulisse
            </p>
          </div>

          {/* Error Message Banner */}
          {displayError && (
            <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 animate-fadeIn">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{displayError}</div>
            </div>
          )}

          {/* Signup Form */}
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1.5">
                Full Name *
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-400">
                  <User size={17} />
                </div>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => { setFullName(e.target.value); setLocalError('') }}
                  placeholder="e.g. Rajesh Kumar"
                  className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-10 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1.5">
                Email address *
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-400">
                  <Mail size={17} />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setLocalError('') }}
                  placeholder="name@example.com"
                  className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-10 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition"
                />
              </div>
            </div>

            {/* Phone + Home City Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Phone (+91) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1.5">
                  Phone (+91)
                </label>
                <div className="relative flex rounded-xl border border-ink-200 bg-ink-50/50 overflow-hidden focus-within:border-brand-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-500/20 transition">
                  <span className="inline-flex items-center gap-1 border-r border-ink-200 bg-ink-100/60 px-2.5 text-xs font-bold text-ink-600 select-none">
                    🇮🇳 +91
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setLocalError('') }}
                    placeholder="98765 43210"
                    className="w-full bg-transparent py-2.5 px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Home City */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1.5">
                  Home City
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-400">
                    <MapPin size={17} />
                  </div>
                  <input
                    type="text"
                    value={homeCity}
                    onChange={(e) => setHomeCity(e.target.value)}
                    placeholder="e.g. Mumbai / Bangalore"
                    className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-10 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition"
                  />
                </div>
              </div>
            </div>

            {/* Password & Confirm Password Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1.5">
                  Password * (Min 8)
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-400">
                    <Lock size={17} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setLocalError('') }}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-10 pr-10 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-400 hover:text-ink-600"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1.5">
                  Confirm Password *
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-400">
                    <Lock size={17} />
                  </div>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setLocalError('') }}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-10 pr-10 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-400 hover:text-ink-600"
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Travel Preferences (Optional) */}
            <div className="pt-2 border-t border-ink-100">
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-600 mb-2">
                <Compass size={14} className="text-brand-500" />
                Travel Style Preference
              </label>
              <div className="flex flex-wrap gap-1.5">
                {TRAVEL_STYLES.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setTravelStyle(st.id)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                      travelStyle === st.id
                        ? 'bg-brand-500 text-white shadow-sm'
                        : 'border border-ink-200 bg-ink-50 text-ink-700 hover:bg-ink-100'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-600 mb-2">
                <Wallet size={14} className="text-emerald-500" />
                Budget Preference
              </label>
              <div className="grid grid-cols-3 gap-2">
                {BUDGET_PREFS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBudgetPref(b.id)}
                    className={`rounded-xl border p-2 text-left transition ${
                      budgetPref === b.id
                        ? 'border-brand-500 bg-brand-50/60 ring-2 ring-brand-500/20'
                        : 'border-ink-200 bg-ink-50 hover:bg-ink-100/60'
                    }`}
                  >
                    <div className="font-bold text-xs text-ink-900">{b.label}</div>
                    <div className="text-[10px] text-ink-500 truncate">{b.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-rose-500 py-3 px-4 text-sm font-bold text-white shadow-md shadow-brand-500/30 transition hover:from-brand-600 hover:to-rose-600 active:scale-[.98] disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>

          {/* Social login divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-ink-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 text-ink-400 font-semibold tracking-wider">
                Or sign up with
              </span>
            </div>
          </div>

          {/* Google Button */}
          <button
            type="button"
            onClick={handleGoogleSignup}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 rounded-xl border border-ink-200 bg-white py-2.5 px-4 text-sm font-semibold text-ink-700 shadow-sm transition hover:bg-ink-50 hover:border-ink-300 active:scale-[.98] disabled:opacity-60"
          >
            <svg className="size-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          {/* Footer link to sign in */}
          <p className="mt-6 text-center text-xs text-ink-500">
            Already have an account?{' '}
            <Link
              href="/login"
              className="font-bold text-brand-600 hover:text-brand-700 transition underline underline-offset-2"
            >
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
