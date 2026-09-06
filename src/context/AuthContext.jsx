import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(response => response.ok ? response.json() : null)
      .then(body => setUser(body?.user || null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = async (email, password, remember = false) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, remember }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) return { ok: false, error: body.error || 'Invalid email or password.' }
      const session = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
      const current = await session.json().catch(() => ({}))
      if (!session.ok || !current.user) return { ok: false, error: 'The sign-in session could not be established. Please try again.' }
      setUser(current.user)
      return { ok: true, admin: current.admin === true }
    } catch {
      return { ok: false, error: 'The sign-in service is temporarily unavailable.' }
    }
  }

  const register = async (name, email, password) => {
    try {
      const response = await fetch('/api/portal-auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) return { ok: false, error: body.error || 'The account could not be created.' }
      setUser(body.user)
      return { ok: true }
    } catch {
      return { ok: false, error: 'The account service is temporarily unavailable.' }
    }
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
