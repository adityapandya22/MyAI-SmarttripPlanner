import { useState, useEffect } from 'react'
import {
  User, Mail, Phone, MapPin, Compass, Wallet, Camera, Lock,
  Save, Check, AlertCircle, Loader2, ArrowLeft, LogOut, Palmtree, Eye, EyeOff
} from 'lucide-react'
import { useAuth } from '../../agent/authStore'
import { useTrip } from '../../store'
import { navigate } from '../../lib/router'

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

export default function ProfilePage() {
  const { user, updateProfile, changePassword, logout } = useAuth()
  const trips = useTrip((s) => s.trips)

  // Profile Form States
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [homeCity, setHomeCity] = useState('')
  const [travelStyle, setTravelStyle] = useState('balanced')
  const [budgetPref, setBudgetPref] = useState('medium')
  const [avatarUrl, setAvatarUrl] = useState('')

  // Password States
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)

  // Feedback states
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState('')
  const [profileError, setProfileError] = useState('')

  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordError, setPasswordError] = useState('')

  useEffect(() => {
    if (user) {
      setName(user.name || user.displayName || '')
      setEmail(user.email || '')
      setPhone(user.phone || '')
      setHomeCity(user.homeCity || '')
      setTravelStyle(user.travelStyle || 'balanced')
      setBudgetPref(user.budgetPref || 'medium')
      setAvatarUrl(user.avatarUrl || '')
    }
  }, [user])

  // Redirect if not logged in
  useEffect(() => {
    if (!user) {
      navigate('/login')
    }
  }, [user])

  if (!user) {
    return null
  }

  const handleProfileSave = async (e) => {
    e.preventDefault()
    setProfileSuccess('')
    setProfileError('')

    if (!name.trim()) {
      setProfileError('Name cannot be empty')
      return
    }

    setIsSavingProfile(true)
    const res = await updateProfile({
      name: name.trim(),
      displayName: name.trim(),
      phone: phone.trim(),
      homeCity: homeCity.trim(),
      travelStyle,
      budgetPref,
      avatarUrl: avatarUrl.trim(),
    })
    setIsSavingProfile(false)

    if (res.success) {
      setProfileSuccess('Profile updated successfully!')
      setTimeout(() => setProfileSuccess(''), 4000)
    } else {
      setProfileError(res.error || 'Failed to update profile')
    }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    setPasswordSuccess('')
    setPasswordError('')

    if (!currentPassword) {
      setPasswordError('Please enter your current password.')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.')
      return
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match.')
      return
    }

    setIsSavingPassword(true)
    const res = await changePassword(currentPassword, newPassword)
    setIsSavingPassword(false)

    if (res.success) {
      setPasswordSuccess('Password changed successfully!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setTimeout(() => setPasswordSuccess(''), 4000)
    } else {
      setPasswordError(res.error || 'Failed to update password')
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const userInitial = (user.name || user.displayName || user.email || 'U').charAt(0).toUpperCase()

  return (
    <div className="min-h-full bg-ink-100/70 pb-16">
      {/* Top Bar */}
      <header className="border-b border-ink-200 bg-white sticky top-0 z-30 shadow-xs">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold text-ink-600 hover:bg-ink-100 hover:text-ink-900 transition"
          >
            <ArrowLeft size={16} />
            <span>Back to Trips</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition active:scale-95"
            >
              <LogOut size={14} />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">
        {/* Profile Header Card */}
        <div className="rounded-3xl border border-ink-200 bg-white p-6 shadow-sm sm:flex sm:items-center sm:gap-6">
          <div className="relative group mx-auto sm:mx-0 size-20 shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={name}
                className="size-20 rounded-2xl object-cover ring-4 ring-brand-100 shadow-md"
                onError={() => setAvatarUrl('')}
              />
            ) : (
              <div className="grid size-20 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-rose-500 text-2xl font-black text-white shadow-md ring-4 ring-brand-100">
                {userInitial}
              </div>
            )}
          </div>

          <div className="mt-4 sm:mt-0 text-center sm:text-left flex-1 min-w-0">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h1 className="font-display text-2xl font-extrabold text-ink-900 truncate">
                {name || 'Traveler'}
              </h1>
              <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-[11px] font-bold text-brand-700 uppercase tracking-wider">
                {user.role || 'Explorer'}
              </span>
            </div>
            <p className="text-xs text-ink-500 mt-0.5">{email}</p>
            <div className="mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-3 text-xs text-ink-600">
              {phone && (
                <span className="flex items-center gap-1">
                  <Phone size={13} className="text-ink-400" /> {phone}
                </span>
              )}
              {homeCity && (
                <span className="flex items-center gap-1">
                  <MapPin size={13} className="text-ink-400" /> {homeCity}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Palmtree size={13} className="text-brand-500" /> {trips.length} Saved {trips.length === 1 ? 'Trip' : 'Trips'}
              </span>
            </div>
          </div>
        </div>

        {/* Customer Information & Preferences Section */}
        <div className="rounded-3xl border border-ink-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-ink-100 pb-4 mb-5">
            <div>
              <h2 className="font-display text-lg font-bold text-ink-900">Personal & Travel Profile</h2>
              <p className="text-xs text-ink-500">Configure your travel identity and defaults for AI suggestions</p>
            </div>
          </div>

          {profileSuccess && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
              <Check size={16} className="text-emerald-600 shrink-0" />
              <span>{profileSuccess}</span>
            </div>
          )}

          {profileError && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
              <span>{profileError}</span>
            </div>
          )}

          <form onSubmit={handleProfileSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-400">
                    <User size={16} />
                  </div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-9 pr-3 text-sm text-ink-900 focus:border-brand-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-400">
                    <Mail size={16} />
                  </div>
                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full rounded-xl border border-ink-200 bg-ink-100 py-2.5 pl-9 pr-3 text-sm text-ink-500 cursor-not-allowed"
                    title="Account email address cannot be changed directly"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1.5">
                  Phone (+91)
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-400">
                    <Phone size={16} />
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-9 pr-3 text-sm text-ink-900 focus:border-brand-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1.5">
                  Home City
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-400">
                    <MapPin size={16} />
                  </div>
                  <input
                    type="text"
                    value={homeCity}
                    onChange={(e) => setHomeCity(e.target.value)}
                    placeholder="e.g. Mumbai, New Delhi"
                    className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-9 pr-3 text-sm text-ink-900 focus:border-brand-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1.5">
                Profile Photo URL
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-400">
                  <Camera size={16} />
                </div>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/photo.jpg"
                  className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-9 pr-3 text-sm text-ink-900 focus:border-brand-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {/* Travel Style */}
            <div className="pt-2">
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-600 mb-2">
                <Compass size={14} className="text-brand-500" />
                Preferred Travel Style
              </label>
              <div className="flex flex-wrap gap-2">
                {TRAVEL_STYLES.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setTravelStyle(st.id)}
                    className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
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

            {/* Budget Preference */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-600 mb-2">
                <Wallet size={14} className="text-emerald-500" />
                Default Budget Preference
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {BUDGET_PREFS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBudgetPref(b.id)}
                    className={`rounded-xl border p-3 text-left transition ${
                      budgetPref === b.id
                        ? 'border-brand-500 bg-brand-50/70 ring-2 ring-brand-500/20'
                        : 'border-ink-200 bg-ink-50 hover:bg-ink-100/60'
                    }`}
                  >
                    <div className="font-bold text-xs text-ink-900">{b.label}</div>
                    <div className="text-[11px] text-ink-500">{b.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-3 flex justify-end">
              <button
                type="submit"
                disabled={isSavingProfile}
                className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-brand-500/30 hover:bg-brand-600 transition disabled:opacity-60"
              >
                {isSavingProfile ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    <span>Save Profile Changes</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Change Password Section */}
        <div className="rounded-3xl border border-ink-200 bg-white p-6 shadow-sm">
          <div className="border-b border-ink-100 pb-4 mb-5">
            <h2 className="font-display text-lg font-bold text-ink-900">Security & Password</h2>
            <p className="text-xs text-ink-500">Update your account password</p>
          </div>

          {passwordSuccess && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
              <Check size={16} className="text-emerald-600 shrink-0" />
              <span>{passwordSuccess}</span>
            </div>
          )}

          {passwordError && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
              <span>{passwordError}</span>
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1.5">
                Current Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-400">
                  <Lock size={16} />
                </div>
                <input
                  type={showCurrentPw ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-9 pr-10 text-sm text-ink-900 focus:border-brand-500 focus:bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPw(!showCurrentPw)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-400 hover:text-ink-600"
                >
                  {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1.5">
                  New Password (min 8 characters)
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-400">
                    <Lock size={16} />
                  </div>
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-9 pr-10 text-sm text-ink-900 focus:border-brand-500 focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-400 hover:text-ink-600"
                  >
                    {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-600 mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-400">
                    <Lock size={16} />
                  </div>
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-ink-200 bg-ink-50/50 py-2.5 pl-9 pr-3 text-sm text-ink-900 focus:border-brand-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={isSavingPassword}
                className="flex items-center gap-2 rounded-xl bg-ink-900 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-black transition disabled:opacity-60"
              >
                {isSavingPassword ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <>
                    <Lock size={16} />
                    <span>Update Password</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
