import { useState, useRef, useEffect } from 'react'
import { User, LogOut, Palmtree, ChevronDown, LogIn, UserPlus } from 'lucide-react'
import { useAuth } from '../../agent/authStore'
import { useTrip } from '../../store'
import { navigate } from '../../lib/router'

export default function UserMenu({ compact = false }) {
  const { user, logout } = useAuth()
  const closeTrip = useTrip((s) => s.closeTrip)
  const trips = useTrip((s) => s.trips)
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  if (!user) {
    return (
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={() => navigate('/login')}
          className="flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-bold text-ink-700 shadow-xs hover:border-ink-300 hover:bg-ink-50 transition active:scale-[.97]"
        >
          <LogIn size={13} className="text-brand-500" />
          <span>Login</span>
        </button>
        <button
          onClick={() => navigate('/signup')}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-rose-500 px-2.5 py-1.5 text-xs font-bold text-white shadow-xs hover:from-brand-600 hover:to-rose-600 transition active:scale-[.97]"
        >
          <UserPlus size={13} />
          <span>Sign up</span>
        </button>
      </div>
    )
  }

  const initial = (user.name || user.displayName || user.email || 'U').charAt(0).toUpperCase()
  const displayName = user.name || user.displayName || 'Traveler'

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-2xl border border-ink-200 bg-white/90 p-1 pl-1.5 pr-2.5 shadow-xs hover:border-brand-300 hover:bg-brand-50/30 transition active:scale-95"
        aria-label="User profile menu"
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={displayName}
            className="size-7 rounded-xl object-cover ring-1 ring-brand-200"
          />
        ) : (
          <div className="grid size-7 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-rose-500 text-xs font-black text-white shadow-xs">
            {initial}
          </div>
        )}
        {!compact && (
          <div className="hidden sm:block text-left max-w-[100px] truncate">
            <span className="block text-xs font-bold text-ink-800 truncate">{displayName}</span>
          </div>
        )}
        <ChevronDown size={14} className={`text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-ink-200 bg-white p-1.5 shadow-xl z-[700] animate-fadeIn">
          {/* User Info Header */}
          <div className="border-b border-ink-100 px-3 py-2.5">
            <p className="text-xs font-extrabold text-ink-900 truncate">{displayName}</p>
            <p className="text-[11px] text-ink-400 truncate">{user.email}</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="rounded-md bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">
                {user.role === 'admin' ? 'Admin' : 'Traveler'}
              </span>
              <span className="text-[10px] text-ink-500">
                {trips.length} {trips.length === 1 ? 'trip' : 'trips'}
              </span>
            </div>
          </div>

          {/* Links */}
          <div className="py-1">
            <button
              onClick={() => {
                setOpen(false)
                navigate('/profile')
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50 hover:text-ink-900 transition"
            >
              <User size={15} className="text-brand-500" />
              <span>Profile</span>
            </button>
            <button
              onClick={() => {
                setOpen(false)
                closeTrip()
                navigate('/')
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50 hover:text-ink-900 transition"
            >
              <Palmtree size={15} className="text-brand-500" />
              <span>My Trips</span>
            </button>
          </div>

          <div className="border-t border-ink-100 pt-1">
            <button
              onClick={async () => {
                setOpen(false)
                await logout()
                navigate('/login')
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
            >
              <LogOut size={15} />
              <span>Log out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
