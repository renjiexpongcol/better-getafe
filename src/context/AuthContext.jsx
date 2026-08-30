import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)

// Demo accounts only — replace with a real backend/API when available.
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

  const login = (email, password) => {
    const key = (email || '').trim().toLowerCase()
    const account = DEMO_USERS[key]
    if (account && account.password === password) {
      setUser({ email: key, name: account.name, role: account.role })
      return { ok: true }
    }
    return { ok: false, error: 'Invalid email or password. Please try one of the demo accounts below.' }
  }

  const register = (name, email, password) => {
    setUser({ email: email.trim().toLowerCase(), name: name.trim(), role: 'Resident' })
    return { ok: true }
  }

  const logout = () => setUser(null)

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
