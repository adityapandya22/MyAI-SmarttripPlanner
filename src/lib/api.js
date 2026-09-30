/**
 * Central API Client for MyAI-SmarttripPlanner
 *
 * Enforces security and authentication standards across all endpoints:
 * - Always includes 'X-Requested-With': 'XMLHttpRequest' for CSRF protection
 * - Always includes 'Content-Type': 'application/json' for JSON payloads
 * - Always sets credentials: 'include' for session cookie transmission
 * - Handles JSON serialization and error parsing consistently
 */

const API_BASE = ''

export class ApiError extends Error {
  constructor(message, status = 500, data = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

/**
 * Core fetch wrapper
 */
export async function apiRequest(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`
  const {
    method = 'GET',
    headers = {},
    body,
    signal,
    ...restOptions
  } = options

  const defaultHeaders = {
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  }

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData

  if (body !== undefined && !isFormData) {
    defaultHeaders['Content-Type'] = 'application/json'
  }

  const fetchOptions = {
    method,
    headers: {
      ...defaultHeaders,
      ...headers,
    },
    credentials: 'include',
    signal,
    ...restOptions,
  }

  if (body !== undefined) {
    fetchOptions.body = isFormData ? body : (typeof body === 'string' ? body : JSON.stringify(body))
  }

  let response
  try {
    response = await fetch(url, fetchOptions)
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError(err.message || 'Network connection error. Server unreachable.', 0)
  }

  // Parse JSON response if present
  let data = null
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      data = await response.json()
    } catch {
      data = null
    }
  } else {
    try {
      const text = await response.text()
      data = text ? { message: text } : null
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    const errorMsg = data?.error || data?.message || `Request failed with status ${response.status}`
    throw new ApiError(errorMsg, response.status, data)
  }

  return data
}

export const api = {
  get: (url, options = {}) => apiRequest(url, { ...options, method: 'GET' }),
  post: (url, body, options = {}) => apiRequest(url, { ...options, method: 'POST', body }),
  put: (url, body, options = {}) => apiRequest(url, { ...options, method: 'PUT', body }),
  patch: (url, body, options = {}) => apiRequest(url, { ...options, method: 'PATCH', body }),
  delete: (url, options = {}) => apiRequest(url, { ...options, method: 'DELETE' }),

  auth: {
    me: () => api.get('/api/auth/me'),
    login: (email, password, rememberMe = false) =>
      api.post('/api/auth/login', { email, password, rememberMe }),
    signup: (userData) =>
      api.post('/api/auth/register', userData),
    google: (googleData) =>
      api.post('/api/auth/google', googleData),
    logout: () =>
      api.post('/api/auth/logout'),
    forgotPassword: (email) =>
      api.post('/api/auth/forgot-password', { email }),
    getProfile: () =>
      api.get('/api/auth/profile'),
    updateProfile: (profileData) =>
      api.put('/api/auth/profile', profileData),
    changePassword: (currentPassword, newPassword) =>
      api.put('/api/auth/password', { currentPassword, newPassword }),
    adminLogin: (email, password) =>
      api.post('/api/auth/admin-login', { email, password }),
  },

  trips: {
    list: () => api.get('/api/trips'),
    get: (id) => api.get(`/api/trips/${id}`),
    create: (trip) => api.post('/api/trips', trip),
    update: (id, trip) => api.put(`/api/trips/${id}`, trip),
    delete: (id) => api.delete(`/api/trips/${id}`),
  },

  admin: {
    overview: () => api.get('/api/admin/overview'),
    users: () => api.get('/api/admin/users'),
    trips: () => api.get('/api/admin/trips'),
    settings: () => api.get('/api/admin/settings'),
    saveSetting: (key, value) => api.post('/api/admin/settings', { key, value }),
    setUserStatus: (userId, isActive) => api.post(`/api/admin/users/${userId}/status`, { isActive }),
    resetPassword: (userId) => api.post(`/api/admin/users/${userId}/reset-password`),
    deleteUser: (userId) => api.delete(`/api/admin/users/${userId}`),
    auditLogs: () => api.get('/api/admin/audit'),
  },

  places: {
    search: (query, signal) => api.get(`/api/places/search?q=${encodeURIComponent(query)}`, { signal }),
  },
}

export default api
