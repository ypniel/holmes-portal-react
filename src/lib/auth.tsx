import React, { createContext, useContext, useState, useEffect } from "react"

const HOLMES_DOMAINS = ["holmes.edu.au", "holmeseducation.group"]

export function isHolmesStaff(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() || ""
  return HOLMES_DOMAINS.some(d => domain === d)
}

export function isDirectStudent(companyName?: string): boolean {
  return companyName === "Direct Student"
}

interface User {
  id: string
  companyId?: string
  name: string
  email: string
  fullName: string
  companyName?: string
  phone?: string
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isStaff: boolean
  login: (user: User) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isStaff: false,
  login: () => {},
  logout: () => {},
})

const STORAGE_KEY = "holmes_portal_user"
const SESSION_EXPIRY_MS = 8 * 60 * 60 * 1000 // 8 hours

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        const loginTime = parsed._loginTime || 0
        const expired = Date.now() - loginTime > SESSION_EXPIRY_MS
        if (expired) {
          // Session expired — clear and force re-login
          localStorage.removeItem(STORAGE_KEY)
          sessionStorage.removeItem("holmes_company_id")
          sessionStorage.removeItem("holmes_session_token")
        } else {
          setUser(parsed)
        }
      }
    } catch {}
    setIsLoading(false)
  }, [])

  const login = (u: User) => {
    setUser(u)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...u, _loginTime: Date.now() }))
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem("holmes_company_id")
  }

  const isStaff = user ? isHolmesStaff(user.email) : false

  return (
    <AuthContext.Provider value={{ user, isLoading, isStaff, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
