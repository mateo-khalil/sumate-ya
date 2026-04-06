import { readJson } from '../lib/http.js'
import type { SessionUser } from '../types.js'

const tokenKey = 'sumateya_token'
const userKey = 'sumateya_user'

let authToken: string | null = localStorage.getItem(tokenKey)

let currentUser: SessionUser | null = (() => {
  const raw = localStorage.getItem(userKey)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as SessionUser
  } catch {
    return null
  }
})()

export const sessionStore = {
  getUser() {
    return currentUser
  },

  getToken() {
    return authToken
  },

  authHeaders(): Record<string, string> {
    if (!authToken) {
      return {}
    }
    return { Authorization: `Bearer ${authToken}` }
  },

  requireAuth() {
    if (!currentUser) {
      throw new Error('Primero inicia sesión')
    }
    return currentUser
  },

  setSession(token: string, user: SessionUser) {
    authToken = token
    currentUser = user
    localStorage.setItem(tokenKey, token)
    localStorage.setItem(userKey, JSON.stringify(user))
  },

  clearSession() {
    authToken = null
    currentUser = null
    localStorage.removeItem(tokenKey)
    localStorage.removeItem(userKey)
  },

  async verifySession(apiBase: string) {
    if (!authToken) {
      this.clearSession()
      return null
    }

    try {
      const response = await fetch(`${apiBase}/auth/verificar`, {
        headers: {
          ...this.authHeaders(),
        },
      })

      const payload = await readJson<{ data: { user: SessionUser } }>(response)
      currentUser = payload.data.user
      localStorage.setItem(userKey, JSON.stringify(payload.data.user))
      return currentUser
    } catch {
      this.clearSession()
      return null
    }
  },
}
