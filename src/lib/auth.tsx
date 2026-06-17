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

const SESSION_KEY = "holmes_portal_user"       // sessionStorage — clears on tab close
const PERSIST_KEY = "holmes_portal_persist"    // localStorage  — mobile fallback
const SESSION_EXPIRY_MS = 8 * 60 * 60 * 1000  // 8 hours

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    try {
      // 1. Try sessionStorage first (desktop tab close = logged out)
      const session = sessionStorage.getItem(SESSION_KEY)
      if (session) {
        setUser(JSON.parse(session))
        setIsLoading(false)
        return
      }

      // 2. Fall back to localStorage (mobile survives backgrounding)
      const persisted = localStorage.getItem(PERSIST_KEY)
      if (persisted) {
        const parsed = JSON.parse(persisted)
        const loginTime = parsed._loginTime || 0
        const expired = Date.now() - loginTime > SESSION_EXPIRY_MS

        if (expired) {
          // Session too old — clear everything, force re-login
          localStorage.removeItem(PERSIST_KEY)
          sessionStorage.removeItem("holmes_company_id")
          sessionStorage.removeItem("holmes_session_token")
        } else {
          // Still within 8 hours — restore session (mobile came back from background)
          setUser(parsed)
          // Rewrite to sessionStorage so subsequent checks are fast
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(parsed))
        }
      }
    } catch {}
    setIsLoading(false)
  }, [])

  const login = (u: User) => {
    setUser(u)
    // Write to both:
    // sessionStorage — primary, clears on tab close
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(u))
    // localStorage — fallback for mobile, includes timestamp for expiry check
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ ...u, _loginTime: Date.now() }))
  }

  const logout = () => {
    setUser(null)
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem("holmes_company_id")
    sessionStorage.removeItem("holmes_session_token")
    localStorage.removeItem(PERSIST_KEY)
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
