import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)

// Resident demo account kept for the public portal; administrator access uses
// the server-backed CMS authentication endpoint.
const DEMO_USERS = {
  'admin@getafe.gov.ph': { password: 'admin123', name: 'Cary M. Camacho', role: 'Municipal Administrator' },
  'resident@getafe.gov.ph': { password: 'getafe123', name: 'Juan Getafeño', role: 'Resident' },
}

function readStoredUser() {
  try {
    const stored = localStorage.getItem('getafe_user')
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser)

  useEffect(() => {
    if (user) {
      localStorage.setItem('getafe_user', JSON.stringify(user))
    } else {
      localStorage.removeItem('getafe_user')
    }
  }, [user])

  const login = async (email, password) => {
    const key = (email || '').trim().toLowerCase()
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: key, password }),
      })
      if (response.ok) {
        const { token, user: admin } = await response.json()
        localStorage.setItem('getafe_cms_token', token)
        setUser({ ...admin, role: 'admin' })
        return { ok: true, admin: true }
      }
    } catch {
      return { ok: false, error: 'The sign-in service is unavailable. Start the local server and try again.' }
    }
    const account = DEMO_USERS[key]
    if (account && account.password === password) {
      setUser({ email: key, name: account.name, role: account.role })
      return { ok: true, admin: false }
    }
    return { ok: false, error: 'Invalid email or password. Please try one of the demo accounts below.' }
  }

  const register = (name, email, password) => {
    setUser({ email: email.trim().toLowerCase(), name: name.trim(), role: 'Resident' })
    return { ok: true }
  }

  const logout = () => {
    localStorage.removeItem('getafe_cms_token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
