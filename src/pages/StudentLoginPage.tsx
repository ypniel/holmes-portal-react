import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight, Mail, GraduationCap, AlertCircle, CheckCircle, LoaderCircle } from "lucide-react"


export default function StudentLoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus("loading")
    setErrorMessage(null)

    const cleanEmail = email.trim().toLowerCase()

    try {
      const res = await fetch("/.netlify/functions/request-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      })
      const data = await res.json()

      if (!res.ok || !data.ok) {
        setStatus("error")
        setErrorMessage("Something went wrong. Please try again.")
        return
      }

      // Always show "sent" — even if the email wasn't found, we don't reveal
      // that, to prevent attackers fishing for which emails are registered.
      setStatus("sent")
    } catch {
      setStatus("error")
      setErrorMessage("Something went wrong. Please try again.")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden animated-bg">

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
            <span className="text-red-200 text-xs leading-none mt-0.5">Admissions Direct Student Portal</span>
          </div>
        </div>
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
          <div className="p-8">

            {status === "sent" ? (
              /* ── Sent confirmation ── */
              <div className="text-center">
                <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-7 w-7 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800">Check your email</h2>
                <p className="mt-2 text-sm text-gray-500">
                  If an account exists for <span className="font-medium text-gray-700">{email.trim().toLowerCase()}</span>,
                  we've sent a secure login link. It expires in 15 minutes.
                </p>
                <p className="mt-4 text-xs text-gray-400">
                  Didn't get it? Check your spam folder, or{" "}
                  <button
                    onClick={() => { setStatus("idle"); setEmail("") }}
                    className="text-red-600 hover:text-red-700 underline underline-offset-2 font-medium"
                  >
                    try again
                  </button>.
                </p>
              </div>
            ) : (
              /* ── Email entry form ── */
              <>
                <div className="text-center mb-8">
                  <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <GraduationCap className="h-7 w-7 text-red-700" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800">Student Portal</h2>
                  <p className="mt-1 text-sm text-gray-500">Enter your email to receive a secure login link</p>
                </div>

                {status === "error" && errorMessage && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{errorMessage}</p>
                  </div>
                )}

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

                  <button
                    type="submit"
                    disabled={status === "loading" || !email}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-opacity"
                    style={{ background: "linear-gradient(135deg, #991b1b, #7f1d1d)" }}
                  >
                    {status === "loading" ? (
                      <><LoaderCircle className="h-4 w-4 animate-spin" /> Sending link…</>
                    ) : (
                      <><span>Email me a login link</span><ArrowRight className="h-4 w-4" /></>
                    )}
                  </button>
                </form>

                {/* New student / agent links */}
                <div className="mt-6 pt-5 border-t border-stone-100 space-y-3">
                  <a
                    href="https://share.hsforms.com/2nrqky_hbSQu2wZj0XxTnVgnrkx6"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl border-2 border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300 transition-colors"
                  >
                    <div className="text-center">
                      <p className="text-sm font-bold text-red-700">New student? Apply here</p>
                      <p className="text-xs text-red-500 mt-0.5">Submit your direct student application</p>
                    </div>
                  </a>
                  <button
                    onClick={() => navigate("/login")}
                    className="w-full text-xs text-gray-400 hover:text-red-600 transition-colors"
                  >
                    Are you an agent? Sign in here →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-white/40">
          © {new Date().getFullYear()} Holmes Institute Australia. All rights reserved.
        </p>
      </div>
    </div>
  )
}
