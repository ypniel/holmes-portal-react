import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2, CheckCircle, Mail, ArrowRight, AlertCircle, XCircle } from "lucide-react"
import { AuroraBackground, HOLMES_AURORA_COLORS } from "../components/AuroraBackground"
import { useAuth } from "../lib/auth"
import { lookupContact } from "../lib/hubspot"

type Status = "idle" | "loading" | "success" | "not_found" | "error"

export default function LoginPage() {
  const navigate = useNavigate()
  const { user, login } = useAuth()
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (user) navigate("/")
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus("loading")
    setErrorMessage(null)
    // Demo mode: accept any email
    setTimeout(() => {
      login({
        id: "demo",
        name: email.split("@")[0],
        fullName: email.split("@")[0],
        email: email.trim().toLowerCase(),
      })
      setStatus("success")
      setTimeout(() => navigate("/"), 800)
    }, 800)
  }

  const reset = () => { setStatus("idle"); setEmail(""); setErrorMessage(null) }

  const primaryColor = "#991b1b"

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-stone-950">
      <AuroraBackground colorStops={HOLMES_AURORA_COLORS} speed={0.6} amplitude={1.2} blend={0.6} />

      {/* Logo top-left */}
      <div className="absolute top-6 left-8 z-10">
        <div className="flex items-center gap-2.5">
          <img
            src="https://holmes.edu.au/templates/images/Logo-base-banner.png"
            alt="Holmes"
            className="h-8 w-auto"
            onError={(e) => { e.currentTarget.style.display = "none" }}
          />
          <span className="text-lg font-semibold text-white">Holmes Admissions</span>
        </div>
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
          <div className="p-8">

            {/* Success */}
            {status === "success" && (
              <div className="text-center">
                <CheckCircle className="h-10 w-10 mx-auto mb-4 text-emerald-500" />
                <h2 className="text-2xl font-bold text-gray-800">Welcome back!</h2>
                <p className="mt-1 text-sm text-gray-500 mb-4">Signing you in…</p>
              </div>
            )}

            {/* Not Found */}
            {status === "not_found" && (
              <div className="text-center">
                <XCircle className="h-10 w-10 mx-auto mb-4 text-gray-400" />
                <h2 className="text-2xl font-bold text-gray-800">Account not found</h2>
                <p className="mt-1 text-sm text-gray-500 mb-4">
                  We couldn't find an account for <strong>{email}</strong>
                </p>
                <div className="rounded-lg p-4 mb-6 bg-red-50 border border-red-100">
                  <p className="text-sm text-red-700">
                    Make sure you're using the email address registered for this portal.
                    If you believe this is an error, contact admissions@holmes.edu.au
                  </p>
                </div>
                <button
                  onClick={reset}
                  className="px-6 py-2 rounded-lg text-white text-sm font-medium"
                  style={{ background: primaryColor }}
                >
                  Try again
                </button>
              </div>
            )}

            {/* Error */}
            {status === "error" && (
              <div className="text-center">
                <AlertCircle className="h-10 w-10 mx-auto mb-4 text-gray-400" />
                <h2 className="text-2xl font-bold text-gray-800">Something went wrong</h2>
                <p className="mt-1 text-sm text-gray-500 mb-6">{errorMessage}</p>
                <button onClick={reset} className="px-6 py-2 rounded-lg text-white text-sm font-medium" style={{ background: primaryColor }}>
                  Try again
                </button>
              </div>
            )}

            {/* Login Form */}
            {(status === "idle" || status === "loading") && (
              <>
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-gray-800">Welcome back</h2>
                  <p className="mt-1 text-sm text-gray-500">Sign in to the Holmes Agent Portal</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="email" className="block text-sm font-medium text-gray-600">
                      Email address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={status === "loading"}
                        placeholder="you@agency.com"
                        autoComplete="email"
                        autoFocus
                        className="w-full pl-10 pr-4 py-2.5 border border-stone-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={status === "loading" || !email}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-opacity"
                    style={{ background: `linear-gradient(135deg, ${primaryColor}, #7f1d1d)` }}
                  >
                    {status === "loading" ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />Signing in…</>
                    ) : (
                      <><span>Continue with Email</span><ArrowRight className="h-4 w-4" /></>
                    )}
                  </button>
                </form>

                <p className="mt-4 text-center text-xs text-gray-400">
                  For portal access, contact your Holmes admissions representative.
                </p>

                <div className="mt-4 pt-4 border-t border-stone-100 text-center">
                  <p className="text-xs text-gray-500 mb-2">Applying without an agent?</p>
                  <a
                    href="https://share.hsforms.com/295xCp21qRwiF7dm8byV6SQnrkx6"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700 hover:text-red-800 transition-colors"
                  >
                    Register as a Direct Student →
                  </a>
                </div>
              </>
            )}
          </div>
        </div>

        <p className="mt-3 text-center text-xs text-white/40">
          Holmes Education Group · Agent Portal
        </p>
      </div>
    </div>
  )
}
