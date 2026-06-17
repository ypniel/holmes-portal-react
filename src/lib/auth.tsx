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

// v3 keys — old keys (holmes_portal_user, holmes_portal_persist) are ignored automatically
const PERSIST_KEY       = "holmes_portal_v3"    // localStorage — mobile fallback
const TAB_FLAG          = "holmes_tab_v3"        // sessionStorage — tab lifecycle signal
const SESSION_EXPIRY_MS = 8 * 60 * 60 * 1000    // 8 hours

// Clean up any old keys from previous versions
function cleanOldKeys() {
  localStorage.removeItem("holmes_portal_user")
  localStorage.removeItem("holmes_portal_persist")
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Always clean up old session keys from previous versions
    cleanOldKeys()

    try {
      const tabAlive = sessionStorage.getItem(TAB_FLAG)

      if (!tabAlive) {
        // No tab flag — fresh tab open, force re-login
        localStorage.removeItem(PERSIST_KEY)
        sessionStorage.removeItem("holmes_company_id")
        sessionStorage.removeItem("holmes_session_token")
        sessionStorage.setItem(TAB_FLAG, "1")
        setIsLoading(false)
        return
      }

      // Tab flag exists — refresh within same open tab, restore session
      const persisted = localStorage.getItem(PERSIST_KEY)
      if (persisted) {
        const parsed = JSON.parse(persisted)
        const loginTime = parsed._loginTime || 0
        const expired = Date.now() - loginTime > SESSION_EXPIRY_MS

        if (expired) {
          localStorage.removeItem(PERSIST_KEY)
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
    sessionStorage.setItem(TAB_FLAG, "1")
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ ...u, _loginTime: Date.now() }))
  }

  const logout = () => {
    setUser(null)
    sessionStorage.removeItem(TAB_FLAG)
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
