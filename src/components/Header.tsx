import React, { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Home, FileText, Menu, X, Settings, LogOut } from "lucide-react"
import { useAuth } from "../lib/auth"
import { initials } from "../lib/utils"

const NAV_ITEMS = [
  { path: "/", label: "Home", icon: Home },
  { path: "/applications", label: "Applications", icon: FileText },
]

function useLiveStatus() {
  const [isLive, setIsLive] = useState(false)
  useEffect(() => {
    const check = () => {
      const melbStr = new Date().toLocaleString("en-AU", { timeZone: "Australia/Melbourne", hour12: false })
      const parts = melbStr.split(", ")
      if (parts.length < 2) return
      const h = parseInt(parts[1].split(":")[0])
      const dateSegments = parts[0].split("/")
      const day = new Date(parseInt(dateSegments[2]), parseInt(dateSegments[1]) - 1, parseInt(dateSegments[0])).getDay()
      setIsLive(day >= 1 && day <= 5 && h >= 9 && h < 17)
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])
  return isLive
}

export function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const isLive = useLiveStatus()

  const handleNav = (path: string) => { navigate(path); setMobileOpen(false) }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-red-800/95 backdrop-blur-sm border-b border-red-900">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-16">

          {/* Logo — left aligned, tighter gap */}
          <button onClick={() => handleNav("/")} className="flex items-center gap-2 flex-shrink-0">
            <img
              src="https://holmes.edu.au/templates/images/Logo-base-banner.png"
              alt="Holmes Institute Australia"
              className="h-7 w-auto"
              onError={(e) => { e.currentTarget.style.display = "none" }}
            />
            <div className="hidden sm:flex flex-col leading-tight text-left">
              <span className="text-white text-sm font-bold leading-none">Holmes Institute Australia</span>
              <span className="text-red-200 text-xs leading-none mt-0.5">Admissions Portal</span>
            </div>
          </button>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = location.pathname === item.path ||
                (item.path !== "/" && location.pathname.startsWith(item.path))
              return (
                <button key={item.path} onClick={() => handleNav(item.path)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active ? "bg-red-900/50 text-red-50" : "text-red-100 hover:text-white hover:bg-red-900/30"
                  }`}
                >
                  <item.icon className="h-4 w-4" />{item.label}
                </button>
              )
            })}
          </nav>

          {/* Right: Live status + user */}
          <div className="flex items-center gap-3 relative">
            {/* Live/Closed indicator */}
            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${
              isLive
                ? "bg-emerald-500/20 border-emerald-400/30 text-emerald-300"
                : "bg-stone-500/20 border-stone-400/30 text-stone-300"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-emerald-400 animate-pulse" : "bg-stone-400"}`} />
              {isLive ? "Live" : "Closed"}
            </div>

            <button onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-red-100 hover:text-white hover:bg-red-900/30 transition-colors"
            >
              <div className="h-7 w-7 rounded-full bg-red-600 flex items-center justify-center text-white text-xs font-medium">
                {initials(user?.fullName || user?.name)}
              </div>
              <span className="hidden sm:inline text-sm font-medium">
                {user?.fullName?.split(" ")[0] || "Account"}
              </span>
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-stone-200 rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100">
                  <p className="text-sm font-semibold text-gray-800">{user?.fullName || user?.name}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>
                <button onClick={() => { navigate("/settings"); setProfileOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-stone-50 transition-colors"
                >
                  <Settings className="h-4 w-4 text-gray-400" />Settings
                </button>
                <button onClick={() => { logout(); setProfileOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors border-t border-stone-100"
                >
                  <LogOut className="h-4 w-4" />Sign Out
                </button>
              </div>
            )}

            <button className="md:hidden text-red-100 hover:text-white hover:bg-red-900/30 p-2 rounded-lg"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileOpen && (
          <div className="md:hidden py-4 border-t border-red-900 bg-red-800">
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => (
                <button key={item.path} onClick={() => handleNav(item.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === item.path ? "bg-red-900/50 text-red-50" : "text-red-100 hover:text-white hover:bg-red-900/30"
                  }`}
                >
                  <item.icon className="h-4 w-4" />{item.label}
                </button>
              ))}
              <button onClick={() => { logout(); setMobileOpen(false) }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-200 hover:text-white hover:bg-red-900/30"
              >
                <LogOut className="h-4 w-4" />Sign Out
              </button>
            </nav>
          </div>
        )}
      </div>
    </header>
  )
}
