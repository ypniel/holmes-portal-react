import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { AuroraBackground } from "../components/AuroraBackground"
import { ArrowRight, Mail, Lock, Eye, EyeOff, GraduationCap, AlertCircle } from "lucide-react"
import { LoaderCircle } from "lucide-react"

const DEMO_PASSWORD = import.meta.env.VITE_PORTAL_PASSWORD
const HOLMES_AURORA = ["#991b1b", "#b91c1c", "#7f1d1d"]

export default function StudentLoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus("loading")
    setErrorMessage(null)

    if (password !== DEMO_PASSWORD) {
      setStatus("error")
      setErrorMessage("Incorrect password. Please try again.")
      return
    }

    const cleanEmail = email.trim().toLowerCase()

    try {
      // Step 1: Find contact by email
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

      if (!contact) {
        setStatus("error")
        setErrorMessage("No student account found for this email. Please contact Holmes admissions.")
        return
      }

      // Step 2: Get associated deals
      const dealAssocRes = await fetch(`/.netlify/functions/hubspot?path=${encodeURIComponent(`/crm/v4/objects/contacts/${contact.id}/associations/deals`)}`)
      const dealAssocData = await dealAssocRes.json()
      const dealId = dealAssocData.results?.[0]?.toObjectId

      if (!dealId) {
        setStatus("error")
        setErrorMessage("No application found for this email. Please contact Holmes admissions.")
        return
      }

      // Store student session
      const fn = contact.properties?.firstname || ""
      const ln = contact.properties?.lastname || ""
      const fullName = `${fn} ${ln}`.trim() || cleanEmail.split("@")[0]
      sessionStorage.setItem("holmes_student", JSON.stringify({ email: cleanEmail, fullName, dealId: String(dealId) }))

      navigate(`/student/application/${dealId}`)
    } catch {
      setStatus("error")
      setErrorMessage("Something went wrong. Please try again.")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-stone-950">
      <AuroraBackground colorStops={HOLMES_AURORA} speed={0.6} amplitude={1.2} blend={0.6} />

      {/* Logo */}
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
            <span className="text-red-200 text-xs leading-none mt-0.5">Student Portal</span>
          </div>
        </div>
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
          <div className="p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <GraduationCap className="h-7 w-7 text-red-700" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Student Portal</h2>
              <p className="mt-1 text-sm text-gray-500">Track your Holmes application</p>
            </div>

            {/* Error */}
            {status === "error" && errorMessage && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{errorMessage}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-600">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    disabled={status === "loading"}
                    placeholder="you@email.com"
                    autoComplete="email"
                    autoFocus
                    className="w-full pl-10 pr-4 py-2.5 border border-stone-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-600">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
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
                style={{ background: "linear-gradient(135deg, #991b1b, #7f1d1d)" }}
              >
                {status === "loading" ? (
                  <><LoaderCircle className="h-4 w-4 animate-spin" /> Signing in…</>
                ) : (
                  <><span>View My Application</span><ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </form>

            {/* Back to agent portal */}
            <div className="mt-6 pt-5 border-t border-stone-100 text-center">
              <button
                onClick={() => navigate("/login")}
                className="text-xs text-gray-400 hover:text-red-600 transition-colors"
              >
                Are you an agent? Sign in here →
              </button>
            </div>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-white/40">
          © {new Date().getFullYear()} Holmes Institute Australia. All rights reserved.
        </p>
      </div>
    </div>
  )
}
