import { useState } from 'react'
import { Palmtree, Mail, Lock, Eye, EyeOff, ArrowRight, Sparkles, AlertCircle, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react'
import { useAuth } from '../../agent/authStore'
import { navigate, Link } from '../../lib/router'

import { api } from '../../lib/api'

export default function LoginPage() {
  const { login, loginWithGoogle, error: authError, clearError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [localError, setLocalError] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    clearError()
    setLocalError('')

    if (!email || !email.includes('@')) {
      setLocalError('Please enter a valid email address.')
      return
    }
    if (!password) {
      setLocalError('Please enter your password.')
      return
    }

    setIsLoading(true)
    const result = await login(email, password, rememberMe)
    setIsLoading(false)

    if (result.success) {
      if (result.user?.role === 'admin') {
        navigate('/admin')
      } else {
        navigate('/')
      }
    }
  }

  const handleGoogleLogin = async () => {
    clearError()
    setLocalError('')
    setIsLoading(true)
    const result = await loginWithGoogle({
      email: 'traveler.google@example.com',
      name: 'Google Explorer',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    })
    setIsLoading(false)
    if (result.success) {
      if (result.user?.role === 'admin') {
        navigate('/admin')
      } else {
        navigate('/')
      }
    }
  }

  const handleFillDemo = () => {
    setEmail('traveler@example.com')
    setPassword('Traveler123!')
    setLocalError('')
    clearError()
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    if (!forgotEmail || !forgotEmail.includes('@')) {
      setLocalError('Please enter a valid email address to receive reset instructions.')
      return
    }
    setForgotLoading(true)
    try {
      const data = await api.auth.forgotPassword(forgotEmail)
      if (data?.success) {
        setForgotSent(true)
      } else {
        setLocalError(data?.error || 'Failed to send reset email')
      }
    } catch (err) {
      setLocalError(err.message || 'Network error while requesting password reset.')
    } finally {
      setForgotLoading(false)
    }
  }

  const displayError = localError || authError

  return (
    <div className="min-h-full flex flex-col justify-center bg-gradient-to-br from-ink-100 via-brand-50/40 to-ink-50 px-4 py-8 sm:px-6 lg:px-8">
      {/* Return home link */}
      <div className="mx-auto w-full max-w-md mb-4">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-900 transition-colors"
        >
          <ArrowLeft size={14} /> Back to Planner
        </button>
      </div>

      <div className="mx-auto w-full max-w-md">
        {/* Card Header */}
        <div className="rounded-3xl border border-ink-200/80 bg-white/95 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          <div className="flex flex-col items-center text-center">
            <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-rose-500 text-white shadow-lg shadow-brand-500/30 mb-3">
              <Palmtree size={26} strokeWidth={2.4} />
            </div>
            <h1 className="font-display text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
              Welcome back
            </h1>
            <p className="mt-1 text-xs text-ink-500 sm:text-sm">
              Sign in to manage and sync your AI travel itineraries
            </p>
          </div>

          {/* Quick Demo Credentials Pill */}
          <div className="mt-5 rounded-2xl border border-brand-200 bg-brand-50/60 p-3 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-brand-500 shrink-0" />
              <div>
                <span className="font-bold text-ink-900">Demo Customer: </span>
                <span className="text-ink-600">traveler@example.com</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleFillDemo}
              className="rounded-lg bg-brand-500 px-2.5 py-1 font-semibold text-white shadow-sm hover:bg-brand-600 transition"
            >
              Fill Demo
            </button>
          </div>

          {/* Error Message Banner */}
          {displayError && (
            <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 animate-fadeIn">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{displayError}</div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1.5">
                Email address
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

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-600">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700 transition"
                >
                  Forgot password?
                </button>
              </div>
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
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-ink-600 select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="size-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                />
                Remember me for 30 days
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-rose-500 py-2.5 px-4 text-sm font-bold text-white shadow-md shadow-brand-500/30 transition hover:from-brand-600 hover:to-rose-600 active:scale-[.98] disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
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
                Or continue with
              </span>
            </div>
          </div>

          {/* Google Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
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

          {/* Footer link to sign up */}
          <p className="mt-6 text-center text-xs text-ink-500">
            Don't have an account?{' '}
            <Link
              href="/signup"
              className="font-bold text-brand-600 hover:text-brand-700 transition underline underline-offset-2"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-ink-200 bg-white p-6 shadow-2xl">
            <h2 className="font-display text-lg font-bold text-ink-900">Reset your password</h2>
            <p className="mt-1 text-xs text-ink-500">
              Enter your email address and we'll send you instructions to reset your account password.
            </p>

            {forgotSent ? (
              <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-center">
                <CheckCircle2 size={24} className="text-emerald-600 mx-auto mb-2" />
                <p className="text-xs font-bold text-emerald-900">Instructions Dispatched</p>
                <p className="mt-1 text-[11px] text-emerald-700">
                  If an account exists for {forgotEmail}, check your inbox for instructions.
                </p>
                <button
                  type="button"
                  onClick={() => { setShowForgotModal(false); setForgotSent(false) }}
                  className="mt-4 w-full rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="mt-4 space-y-3">
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2 px-3 text-xs text-ink-900 focus:border-brand-500 focus:bg-white focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="flex-1 rounded-xl border border-ink-200 py-2 text-xs font-semibold text-ink-600 hover:bg-ink-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="flex-1 rounded-xl bg-brand-500 py-2 text-xs font-bold text-white hover:bg-brand-600 transition disabled:opacity-50"
                  >
                    {forgotLoading ? 'Sending...' : 'Send Link'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
