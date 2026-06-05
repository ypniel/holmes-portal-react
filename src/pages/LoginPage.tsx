import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2, CheckCircle, Mail, ArrowRight, AlertCircle, XCircle, X, Eye, EyeOff, Lock } from "lucide-react"
import { AuroraBackground, HOLMES_AURORA_COLORS } from "../components/AuroraBackground"
import { useAuth, isHolmesStaff } from "../lib/auth"
import { fetchAgentByEmail, fetchDealsByCompanyId } from "../lib/hubspot"

type Status = "idle" | "loading" | "success" | "not_found" | "error"

// ── Demo direct students ──────────────────────────────────────────────────────
const MARKETERS = [
  { name: "Indra Adhikari",   title: "Victoria Representative",        email: "iadhikari@holmes.edu.au" },
  { name: "Dinesh Chetwani",  title: "Queensland Representative",       email: "dchetwani@holmes.edu.au" },
  { name: "Don Kauffman",     title: "New South Wales Representative",  email: "dkauffman@holmes.edu.au" },
]

const DEMO_PASSWORD = "Holmes2026!"

export default function LoginPage() {
  const navigate = useNavigate()
  const { user, login } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<Status>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  const directDealRef = React.useRef<string | null>(null)

  useEffect(() => {
    if (user) {
      if (directDealRef.current) {
        navigate(`/applications/${directDealRef.current}`)
        directDealRef.current = null
      } else {
        navigate("/")
      }
    }
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus("loading")
    setErrorMessage(null)

    try {
      const cleanEmail = email.trim().toLowerCase()

      // Check password
      if (password !== DEMO_PASSWORD) {
        setStatus("error")
        setErrorMessage("Incorrect password. Please try again.")
        return
      }
      let name = cleanEmail.split("@")[0]
      let fullName = name
      let companyName = isHolmesStaff(cleanEmail) ? "Holmes Institute Australia" : ""

      if (!isHolmesStaff(cleanEmail)) {
        try {
          const agent = await fetchAgentByEmail(cleanEmail)
          if (agent && agent.companyId) {
            // Regular agent — has company association
            if (agent.contactName) { fullName = agent.contactName; name = agent.contactName.split(" ")[0] }
            if (agent.companyName) companyName = agent.companyName
            sessionStorage.setItem("holmes_company_id", agent.companyId)
          } else {
            // No company — check if contact exists and has deals directly
            const contactRes = await fetch(`/.netlify/functions/hubspot?path=${encodeURIComponent("/crm/v3/objects/contacts/search")}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: cleanEmail }] }],
                properties: ["email", "firstname", "lastname"],
                limit: 1,
              })
            })
            const contactData = await contactRes.json()
            const contact = contactData.results?.[0]
            if (contact) {
              // Contact exists but no company = Direct Student
              const dealAssocRes = await fetch(`/.netlify/functions/hubspot?path=${encodeURIComponent(`/crm/v4/objects/contacts/${contact.id}/associations/deals`)}`)
              const dealAssocData = await dealAssocRes.json()
              const dealId = dealAssocData.results?.[0]?.toObjectId
              if (dealId) {
                const fn = contact.properties?.firstname || ""
                const ln = contact.properties?.lastname || ""
                fullName = `${fn} ${ln}`.trim() || cleanEmail.split("@")[0]
                name = fn || fullName.split(" ")[0]
                companyName = "Direct Student"
                directDealRef.current = String(dealId)
              }
            }
          }
        } catch {}
      }
      }

      login({ id: "demo", name, fullName, email: cleanEmail, companyName })
      setStatus("success")
      setTimeout(() => navigate("/"), 800)
    } catch {
      setStatus("error")
      setErrorMessage("Something went wrong. Please try again.")
    }
  }

  const reset = () => { setStatus("idle"); setEmail(""); setPassword(""); setErrorMessage(null) }
  const primaryColor = "#991b1b"

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-stone-950">
      <AuroraBackground colorStops={HOLMES_AURORA_COLORS} speed={0.6} amplitude={1.2} blend={0.6} />

      {/* Logo top-left */}
      <div className="absolute top-6 left-8 z-10">
        <div className="flex items-center gap-2.5">
          <img
            src="https://holmes.edu.au/templates/images/Logo-base-banner.png"
            alt="Holmes Institute Australia"
            className="h-8 w-auto"
            onError={(e) => { e.currentTarget.style.display = "none" }}
          />
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-white text-sm font-bold leading-none">Holmes Institute Australia</span>
            <span className="text-red-200 text-xs leading-none mt-0.5">Admissions Portal</span>
          </div>
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
                <p className="mt-1 text-sm text-gray-500">Signing you in…</p>
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
                    Make sure you're using the email registered for this portal.
                    If you believe this is an error, contact admissions@holmes.edu.au
                  </p>
                </div>
                <button onClick={reset} className="px-6 py-2 rounded-lg text-white text-sm font-medium" style={{ background: primaryColor }}>
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
                  <p className="mt-1 text-sm text-gray-500">Sign in to Holmes Institute Australia Admissions Portal</p>
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

                  <div className="space-y-1.5">
                    <label htmlFor="password" className="block text-sm font-medium text-gray-600">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={status === "loading"}
                        placeholder="••••••••••••"
                        autoComplete="current-password"
                        className="w-full pl-10 pr-10 py-2.5 border border-stone-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={status === "loading" || !email || !password}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-opacity"
                    style={{ background: `linear-gradient(135deg, ${primaryColor}, #7f1d1d)` }}
                  >
                    {status === "loading" ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />Signing in…</>
                    ) : (
                      <><span>Sign In</span><ArrowRight className="h-4 w-4" /></>
                    )}
                  </button>
                </form>

                {/* Contact rep — clickable */}
                <p className="mt-4 text-center text-xs text-gray-400">
                  Need portal access?{" "}
                  <button
                    onClick={() => setShowModal(true)}
                    className="text-red-600 hover:text-red-700 underline underline-offset-2 font-medium transition-colors"
                  >
                    Contact your Holmes admissions representative
                  </button>
                </p>

                {/* Direct Student — bigger */}
                <div className="mt-5 pt-5 border-t border-stone-100">
                  <a
                    href="https://share.hsforms.com/2nrqky_hbSQu2wZj0XxTnVgnrkx6"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl border-2 border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-bold text-red-700">Applying as a Direct Student?</p>
                      <p className="text-xs text-red-500 mt-0.5">Register your application here</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-red-600 flex-shrink-0" />
                  </a>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-3 text-center text-xs text-white/40">
          © {new Date().getFullYear()} Holmes Institute Australia. All rights reserved.
        </p>
      </div>

      {/* Contact Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Contact Your Holmes Representative</h2>
                <p className="text-sm text-gray-500 mt-0.5">Click an email to open in your mail app</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-stone-400 hover:text-stone-600 p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {MARKETERS.map(m => (
                <a
                  key={m.email}
                  href={`mailto:${m.email}`}
                  className="flex items-center gap-4 p-4 rounded-xl border border-stone-100 hover:border-red-200 hover:bg-red-50 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-700 font-bold text-sm flex-shrink-0">
                    {m.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 group-hover:text-red-700 transition-colors">{m.name}</p>
                    <p className="text-xs text-gray-500">{m.title}</p>
                    <p className="text-xs text-red-600 mt-0.5">{m.email}</p>
                  </div>
                  <span className="text-lg">✉️</span>
                </a>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-stone-100">
              <button onClick={() => setShowModal(false)} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
