import React, { useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Home, FileText, Menu, X, Settings, LogOut } from "lucide-react"
import { useAuth } from "../lib/auth"
import { initials } from "../lib/utils"

const NAV_ITEMS = [
  { path: "/", label: "Home", icon: Home },
  { path: "/applications", label: "Applications", icon: FileText },
]

export function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  const handleNav = (path: string) => {
    navigate(path)
    setMobileOpen(false)
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-red-800/95 backdrop-blur-sm border-b border-red-900">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <button onClick={() => handleNav("/")} className="flex items-center gap-3 flex-shrink-0">
            <img
              src="https://holmes.edu.au/templates/images/Logo-base-banner.png"
              alt="Holmes Admissions"
              className="h-8 w-auto"
              onError={(e) => {
                e.currentTarget.style.display = "none"
              }}
            />
            <span className="hidden sm:inline text-lg font-semibold tracking-tight text-white">
              Holmes Admissions
            </span>
          </button>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = location.pathname === item.path ||
                (item.path !== "/" && location.pathname.startsWith(item.path))
              return (
                <button
                  key={item.path}
                  onClick={() => handleNav(item.path)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-red-900/50 text-red-50"
                      : "text-red-100 hover:text-white hover:bg-red-900/30"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              )
            })}
          </nav>

          {/* User / Profile */}
          <div className="flex items-center gap-2 relative">
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-red-100 hover:text-white hover:bg-red-900/30 transition-colors"
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
                <button
                  onClick={() => { navigate("/settings"); setProfileOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-stone-50 transition-colors"
                >
                  <Settings className="h-4 w-4 text-gray-400" />
                  Settings
                </button>
                <button
                  onClick={() => { logout(); setProfileOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors border-t border-stone-100"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            )}

            {/* Mobile Menu Button */}
            <button
              className="md:hidden text-red-100 hover:text-white hover:bg-red-900/30 p-2 rounded-lg"
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
              {NAV_ITEMS.map((item) => {
                const active = location.pathname === item.path
                return (
                  <button
                    key={item.path}
                    onClick={() => handleNav(item.path)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? "bg-red-900/50 text-red-50"
                        : "text-red-100 hover:text-white hover:bg-red-900/30"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </button>
                )
              })}
              <button
                onClick={() => { logout(); setMobileOpen(false) }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-200 hover:text-white hover:bg-red-900/30"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </nav>
          </div>
        )}
      </div>
    </header>
  )
}
