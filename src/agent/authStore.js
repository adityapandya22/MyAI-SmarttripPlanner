import { create } from 'zustand'
import { useTrip } from '../store'
import { normalizeTrip } from '../lib/utils'
import { api } from '../lib/api'

export const useAuth = create((set, get) => ({
  user: null,
  loading: true,
  error: null,

  setUser: (user) => set({ user, error: null }),
  clearError: () => set({ error: null }),

  checkAuth: async () => {
    try {
      set({ loading: true })
      const data = await api.auth.me()
      if (data?.authenticated && data?.user) {
        set({ user: data.user, loading: false })
        // Hydrate trips from user's isolated account in the database
        await get().loadUserTrips()
        return data.user
      } else {
        set({ user: null, loading: false })
        return null
      }
    } catch (err) {
      console.warn('Auth check failed:', err)
      set({ user: null, loading: false })
      return null
    }
  },

  login: async (email, password, rememberMe = false) => {
    set({ loading: true, error: null })
    try {
      const data = await api.auth.login(email, password, rememberMe)
      if (!data?.success && !data?.user) {
        const msg = data?.error || 'Login failed. Please check your credentials.'
        set({ error: msg, loading: false })
        return { success: false, error: msg }
      }

      set({ user: data.user, loading: false, error: null })
      await get().loadUserTrips()
      return { success: true, user: data.user }
    } catch (err) {
      const msg = err.message || 'Unable to connect to the authentication server'
      set({ error: msg, loading: false })
      return { success: false, error: msg }
    }
  },

  signup: async (formData) => {
    set({ loading: true, error: null })
    try {
      const data = await api.auth.signup(formData)
      if (!data?.success && !data?.user) {
        const msg = data?.error || 'Signup failed. Please check the details entered.'
        set({ error: msg, loading: false })
        return { success: false, error: msg }
      }

      set({ user: data.user, loading: false, error: null })
      await get().loadUserTrips()
      return { success: true, user: data.user }
    } catch (err) {
      const msg = err.message || 'Network error during signup'
      set({ error: msg, loading: false })
      return { success: false, error: msg }
    }
  },

  loginWithGoogle: async (googleData = {}) => {
    set({ loading: true, error: null })
    try {
      const data = await api.auth.google(googleData)
      if (!data?.success && !data?.user) {
        const msg = data?.error || 'Google authentication failed'
        set({ error: msg, loading: false })
        return { success: false, error: msg }
      }

      set({ user: data.user, loading: false, error: null })
      await get().loadUserTrips()
      return { success: true, user: data.user }
    } catch (err) {
      const msg = err.message || 'Network error during Google login'
      set({ error: msg, loading: false })
      return { success: false, error: msg }
    }
  },

  logout: async () => {
    try {
      await api.auth.logout()
    } catch (err) {
      console.warn('Logout network error:', err)
    }
    set({ user: null, error: null })
    // Reset trip state so logged-out session has no access to previous user's trips
    useTrip.setState({ trips: [], activeId: null })
    return { success: true }
  },

  updateProfile: async (profileData) => {
    set({ loading: true, error: null })
    try {
      const data = await api.auth.updateProfile(profileData)
      set({ user: data.user, loading: false, error: null })
      return { success: true, user: data.user }
    } catch (err) {
      const msg = err.message || 'Network error while updating profile'
      set({ error: msg, loading: false })
      return { success: false, error: msg }
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    try {
      const data = await api.auth.changePassword(currentPassword, newPassword)
      return { success: true, message: data.message || 'Password updated successfully' }
    } catch (err) {
      return { success: false, error: err.message || 'Network error updating password' }
    }
  },

  loadUserTrips: async () => {
    try {
      const data = await api.trips.list()
      if (Array.isArray(data?.trips)) {
        const normalized = data.trips.map(normalizeTrip)
        useTrip.setState({ trips: normalized })
        return normalized
      }
      return []
    } catch (err) {
      console.warn('Failed to load trips for user:', err)
      return []
    }
  },

  syncTripToServer: async (trip) => {
    const user = get().user
    if (!user) return null
    try {
      await api.trips.update(trip.id, trip)
      return true
    } catch (err) {
      if (err.status === 404) {
        // If not found, create it with POST
        try {
          await api.trips.create(trip)
          return true
        } catch (createErr) {
          console.warn('Trip create sync error:', createErr)
          return false
        }
      }
      console.warn('Trip sync error:', err)
      return false
    }
  },

  deleteTripFromServer: async (tripId) => {
    const user = get().user
    if (!user) return null
    try {
      await api.trips.delete(tripId)
    } catch (err) {
      console.warn('Trip delete sync error:', err)
    }
  },
}))

let prevTrips = []
let syncTimer = null
let syncInitialized = false

export function initAuthTripSync() {
  if (syncInitialized) return
  syncInitialized = true

  useTrip.subscribe((state) => {
    const user = useAuth.getState().user
    if (!user) return

    const currentTrips = state.trips
    if (currentTrips === prevTrips) return

    clearTimeout(syncTimer)
    syncTimer = setTimeout(async () => {
      // Find deleted trips
      const currentIds = new Set(currentTrips.map((t) => t.id))
      for (const pt of prevTrips) {
        if (!currentIds.has(pt.id)) {
          await useAuth.getState().deleteTripFromServer(pt.id)
        }
      }

      // Sync active or modified trips
      for (const t of currentTrips) {
        const prev = prevTrips.find((p) => p.id === t.id)
        if (prev !== t) {
          await useAuth.getState().syncTripToServer(t)
        }
      }
      prevTrips = currentTrips
    }, 600)
  })
}
