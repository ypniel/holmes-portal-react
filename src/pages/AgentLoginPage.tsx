import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2, CheckCircle, Mail, ArrowRight, AlertCircle, Eye, EyeOff, Lock, ArrowLeft, X } from "lucide-react"
import { useAuth } from "../lib/auth"

const MARKETERS = [
  { name: "Indra Adhikari",   title: "Victoria Representative",       email: "iadhikari@holmes.edu.au", phone: "0414 813 163" },
  { name: "Dinesh Chetwani",  title: "Queensland Representative",      email: "dchetwani@holmes.edu.au", phone: "0449 536 879" },
  { name: "Don Kauffman",     title: "New South Wales Representative", email: "dkauffman@holmes.edu.au", phone: "0450 224 845" },
]

export default function AgentLoginPage() {
  const navigate = useNavigate()
  const { user, login } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showResetForm, setShowResetForm] = useState(false)
  const [showOtp, setShowOtp] = useState(false)
  const [otpEmail, setOtpEmail] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [otpToken, setOtpToken] = useState("")
  const [otpStatus, setOtpStatus] = useState<"idle" | "sending" | "sent" | "verifying" | "error">("idle")
  const [otpError, setOtpError] = useState("")
  const [resetEmail, setResetEmail] = useState("")
  const [resetStatus, setResetStatus] = useState<"idle" | "loading" | "sent">("idle")

  useEffect(() => {
    if (user) navigate("/")
  }, [user])

  const reset = () => {
    setStatus("idle")
    setEmail("")
    setPassword("")
    setErrorMessage(null)
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetStatus("loading")
    try {
      await fetch("/.netlify/functions/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail.trim().toLowerCase() }),
      })
    } catch {}
    setResetStatus("sent")
  }

  const handleSendOtp = async () => {
    if (!otpEmail.trim()) return
    setOtpStatus("sending")
    setOtpError("")
    try {
      const res = await fetch("/.netlify/functions/agent-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", email: otpEmail.trim().toLowerCase() }),
      })
      const data = await res.json()
      if (data.notFound) {
        setOtpStatus("idle")
        setOtpError("No account found for this email. Please contact Holmes admissions.")
        return
      }
      if (data.otpToken) setOtpToken(data.otpToken)
      setOtpStatus("sent")
    } catch {
      setOtpStatus("idle")
      setOtpError("Failed to send code. Please try again.")
    }
  }

  const handleVerifyOtp = async () => {
    if (!otpCode.trim()) return
    setOtpStatus("verifying")
    setOtpError("")
    try {
      const res = await fetch("/.netlify/functions/agent-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", email: otpEmail.trim().toLowerCase(), code: otpCode.trim(), otpToken }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setOtpStatus("error")
        setOtpError(data.error || "Incorrect code. Please try again.")
        return
      }
      // Log in
      sessionStorage.setItem("holmes_tab_v3", "1")
      sessionStorage.setItem("holmes_session_token", data.sessionToken)
      if (data.user.companyId) sessionStorage.setItem("holmes_company_id", data.user.companyId)
      login({
        id: data.user.contactId || "agent",
        name: data.user.fullName?.split(" ")[0] || data.user.email.split("@")[0],
        fullName: data.user.fullName,
        email: data.user.email,
        companyName: data.user.companyName || "",
        companyId: data.user.companyId ? String(data.user.companyId) : undefined,
      })
      navigate("/applications")
    } catch {
      setOtpStatus("error")
      setOtpError("Something went wrong. Please try again.")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus("loading")
    setErrorMessage(null)

    const cleanEmail = email.trim().toLowerCase()

    try {
      // Server-side password verification — the password is never checked
      // in the browser, and no shared password lives in the bundle anymore.
      const res = await fetch("/.netlify/functions/agent-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password }),
      })
      const data = await res.json()

      if (!res.ok || !data.ok) {
        setStatus("idle")
        setErrorMessage(data.error || "Incorrect email or password.")
        return
      }

      // Persist company scoping + session token, then log in
      if (data.user.companyId) {
      }
      sessionStorage.setItem("holmes_session_token", data.sessionToken)

      // Save companyId to both localStorage (via login) AND sessionStorage (fallback)
      if (data.user.companyId) {
        sessionStorage.setItem("holmes_company_id", String(data.user.companyId))
      }
      login({
        id: data.user.contactId || "agent",
        name: data.user.fullName?.split(" ")[0] || cleanEmail.split("@")[0],
        fullName: data.user.fullName,
        email: cleanEmail,
        companyName: data.user.companyName || "",
        companyId: data.user.companyId ? String(data.user.companyId) : undefined,
      })
      setStatus("success")
    } catch {
      setStatus("idle")
      setErrorMessage("Something went wrong. Please try again.")
    }
  }

  const primaryColor = "#991b1b"

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden animated-bg">

      {/* Logo */}
      <div className="absolute top-6 left-8 z-10">
        <div className="flex items-center gap-2.5">
          <img
            src="https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/EDM%20Headers%20(1).png"
            alt="Holmes"
            className="h-8 w-auto"
            onError={(e) => { e.currentTarget.style.display = "none" }}
          />
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-white text-sm font-bold leading-none">Holmes Institute Australia</span>
            <span className="text-red-200 text-xs leading-none mt-0.5">Agent Portal</span>
          </div>
        </div>
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
          <div className="p-8">

            {status === "success" && (
              <div className="text-center">
                <CheckCircle className="h-10 w-10 mx-auto mb-4 text-emerald-500" />
                <h2 className="text-2xl font-bold text-gray-800">Welcome back!</h2>
                <p className="mt-1 text-sm text-gray-500">Signing you in…</p>
              </div>
            )}

            {(status === "idle" || status === "loading") && (
              <>
                <div className="flex items-center gap-3 mb-6">
                  <button
                    onClick={() => navigate("/login")}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">Agent Sign In</h2>
                    <p className="text-xs text-gray-500">Holmes Admissions Portal</p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {errorMessage && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      <p className="text-sm text-red-700">{errorMessage}</p>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-600">Email address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
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
                    <label className="block text-sm font-medium text-gray-600">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
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

                  {/* Forgot password */}
                  <div className="flex justify-end -mt-1">
                    <button
                      type="button"
                      onClick={() => setShowResetForm(true)}
                      className="text-xs text-red-600 hover:text-red-700 underline underline-offset-2 transition-colors"
                    >
                      Forgot password?
                    </button>
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

                {/* ── OTP option ── */}
                <div className="flex items-center gap-3 mt-4 mb-2">
                  <div className="flex-1 h-px bg-stone-200" />
                  <span className="text-xs text-stone-400 uppercase tracking-wider">or</span>
                  <div className="flex-1 h-px bg-stone-200" />
                </div>

                {!showOtp ? (
                  <button
                    onClick={() => { setShowOtp(true); setShowResetForm(false); setOtpEmail(email) }}
                    className="w-full py-2.5 border border-stone-200 hover:border-red-300 hover:bg-red-50 text-stone-600 hover:text-red-700 rounded-xl text-sm font-medium transition-colors"
                  >
                    📧 Send me a 6-digit code instead
                  </button>
                ) : otpStatus === "sent" || otpStatus === "verifying" || otpStatus === "error" ? (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 text-center">Enter the 6-digit code sent to <strong>{otpEmail}</strong></p>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otpCode}
                      onChange={e => { setOtpCode(e.target.value.replace(/\D/g, "")); setOtpError("") }}
                      onKeyDown={e => e.key === "Enter" && otpCode.length === 6 && handleVerifyOtp()}
                      placeholder="000000"
                      className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none text-center text-2xl font-bold tracking-widest transition-all bg-white"
                      autoFocus
                    />
                    {otpError && <p className="text-xs text-red-600 text-center">{otpError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowOtp(false); setOtpStatus("idle"); setOtpCode(""); setOtpError("") }}
                        className="flex-1 py-2.5 border border-stone-200 text-stone-500 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleVerifyOtp}
                        disabled={otpCode.length !== 6 || otpStatus === "verifying"}
                        className="flex-1 py-2.5 bg-red-700 hover:bg-red-800 text-white rounded-xl text-sm font-medium disabled:opacity-50 transition-colors"
                      >
                        {otpStatus === "verifying" ? "Verifying…" : "Verify Code"}
                      </button>
                    </div>
                    <button
                      onClick={() => { setOtpStatus("idle"); setOtpCode(""); setOtpError("") }}
                      className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Didn't receive it? Send again
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 text-center">Enter your email and we'll send you a 6-digit login code</p>
                    <input
                      type="email"
                      value={otpEmail}
                      onChange={e => setOtpEmail(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSendOtp()}
                      placeholder="your@email.com"
                      className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none text-sm transition-all bg-white"
                      autoFocus
                    />
                    {otpError && <p className="text-xs text-red-600 text-center">{otpError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowOtp(false); setOtpEmail(""); setOtpError("") }}
                        className="flex-1 py-2.5 border border-stone-200 text-stone-500 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSendOtp}
                        disabled={!otpEmail.trim() || otpStatus === "sending"}
                        className="flex-1 py-2.5 bg-red-700 hover:bg-red-800 text-white rounded-xl text-sm font-medium disabled:opacity-50 transition-colors"
                      >
                        {otpStatus === "sending" ? "Sending…" : "Send Code"}
                      </button>
                    </div>
                  </div>
                )}

                <p className="mt-4 text-center text-xs text-gray-400">
                  Need portal access?{" "}
                  <button
                    onClick={() => setShowModal(true)}
                    className="text-red-600 hover:text-red-700 underline underline-offset-2 font-medium"
                  >
                    Contact your Holmes representative
                  </button>
                </p>
              </>
            )}
          </div>
        </div>

        <p className="mt-3 text-center text-xs text-white/40">
          © {new Date().getFullYear()} Holmes Institute Australia. All rights reserved.
        </p>
      </div>

      {/* Password reset overlay */}
      {showResetForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => { setShowResetForm(false); setResetStatus("idle"); setResetEmail("") }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-8">
              {resetStatus === "sent" ? (
                <div className="text-center">
                  <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="h-6 w-6 text-emerald-600" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-800">Check your email</h2>
                  <p className="mt-2 text-sm text-gray-500">If an agent account exists for that email, we've sent a password reset link. It expires in 15 minutes.</p>
                  <button onClick={() => { setShowResetForm(false); setResetStatus("idle"); setResetEmail("") }}
                    className="mt-6 w-full py-2.5 rounded-lg text-white text-sm font-medium"
                    style={{ background: "linear-gradient(135deg, #991b1b, #7f1d1d)" }}>
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-bold text-gray-800 mb-1">Reset your password</h2>
                  <p className="text-sm text-gray-500 mb-6">Enter your email and we'll send you a reset link.</p>
                  <form onSubmit={handleReset} className="space-y-4">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="email"
                        value={resetEmail}
                        onChange={e => setResetEmail(e.target.value)}
                        required
                        autoFocus
                        placeholder="you@agency.com"
                        className="w-full pl-10 pr-4 py-2.5 border border-stone-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                      />
                    </div>
                    <button type="submit" disabled={resetStatus === "loading" || !resetEmail}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg, #991b1b, #7f1d1d)" }}>
                      {resetStatus === "loading" ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : "Send reset link"}
                    </button>
                    <button type="button" onClick={() => { setShowResetForm(false); setResetStatus("idle"); setResetEmail("") }}
                      className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors">
                      Cancel
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Contact modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
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
              {MARKETERS.map((m) => (
                <a
                  key={m.email}
                  href={`mailto:${m.email}`}
                  className="flex items-center gap-4 p-4 rounded-xl border border-stone-100 hover:border-red-200 hover:bg-red-50 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-700 font-bold text-sm flex-shrink-0">
                    {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 group-hover:text-red-700 transition-colors">{m.name}</p>
                    <p className="text-xs text-gray-500">{m.title}</p>
                    <p className="text-xs text-red-600 mt-0.5">{m.email}</p>
                    {m.phone && <p className="text-xs text-gray-500 mt-0.5">📞 {m.phone}</p>}
                  </div>
                  <span className="text-lg">✉️</span>
                </a>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-stone-100">
              <button
                onClick={() => setShowModal(false)}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
