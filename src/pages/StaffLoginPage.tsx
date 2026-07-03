import React, { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Mail, Loader2, CheckCircle2 } from "lucide-react"
import { useAuth } from "../lib/auth"

export default function StaffLoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [otpToken, setOtpToken] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "verifying" | "success" | "error">("idle")
  const [error, setError] = useState("")

  const STAFF_DOMAINS = ["holmes.edu.au", "holmeseducation.group", "holmescolleges.com"]

  const handleSendCode = async () => {
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) return
    const domain = cleanEmail.split("@")[1] || ""
    if (!STAFF_DOMAINS.includes(domain)) {
      setError("Please use your Holmes staff email address (e.g. you@holmes.edu.au).")
      return
    }
    setStatus("sending")
    setError("")
    try {
      const res = await fetch("/.netlify/functions/agent-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", email: cleanEmail }),
      })
      const data = await res.json()
      if (!data.otpToken) {
        setStatus("idle")
        setError("No Holmes staff account found for this email address.")
        return
      }
      setOtpToken(data.otpToken)
      setStatus("sent")
    } catch {
      setStatus("idle")
      setError("Failed to send code. Please try again.")
    }
  }

  const handleVerify = async () => {
    if (otpCode.length !== 6) return
    setStatus("verifying")
    setError("")
    try {
      const res = await fetch("/.netlify/functions/agent-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", email: email.trim().toLowerCase(), code: otpCode.trim(), otpToken }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setStatus("error")
        setError(data.error || "Incorrect code. Please try again.")
        return
      }
      // Check they are actually Holmes staff
      if (data.user.companyName !== "Holmes Institute Australia") {
        setStatus("error")
        setError("This login is for Holmes staff only. Please use the Agent Partner login instead.")
        return
      }
      sessionStorage.setItem("holmes_tab_v3", "1")
      sessionStorage.setItem("holmes_session_token", data.sessionToken)
      login({
        id: data.user.contactId || "staff",
        name: data.user.fullName?.split(" ")[0] || data.user.email.split("@")[0],
        fullName: data.user.fullName,
        email: data.user.email,
        companyName: "Holmes Institute Australia",
        companyId: undefined,
      })
      setStatus("success")
    } catch {
      setStatus("error")
      setError("Something went wrong. Please try again.")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden animated-bg">
      <div className="absolute top-6 left-8 z-10">
        <div className="flex items-center gap-2.5">
          <img
            src="https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/EDM%20Headers%20(1).png"
            alt="Holmes Institute Australia"
            className="h-8 w-auto"
            onError={(e) => { e.currentTarget.style.display = "none" }}
          />
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-white text-sm font-bold leading-none">Holmes Institute Australia</span>
            <span className="text-red-200 text-xs leading-none mt-0.5">Staff Portal</span>
          </div>
        </div>
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
          <div className="p-8">

            {status === "success" && (
              <div className="text-center">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-4 text-emerald-500" />
                <h2 className="text-2xl font-bold text-gray-800">Welcome!</h2>
                <p className="mt-1 text-sm text-gray-500">Signing you in…</p>
              </div>
            )}

            {status !== "success" && (
              <>
                <div className="flex items-center gap-3 mb-6">
                  <button onClick={() => navigate("/login")} className="text-gray-400 hover:text-gray-600 transition-colors">
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">Holmes Staff Sign In</h2>
                    <p className="text-xs text-gray-500">Holmes Admissions Portal</p>
                  </div>
                </div>

                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-5 text-xs text-red-800 leading-relaxed">
                  <p className="font-semibold mb-0.5">Staff login — 6-digit code only</p>
                  <p>Enter your Holmes staff email to receive a login code.</p>
                </div>

                {status === "idle" || status === "sending" ? (
                  <div className="space-y-4">
                    {error && (
                      <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
                    )}
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-gray-600">Staff email address</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="email"
                          value={email}
                          onChange={e => { setEmail(e.target.value); setError("") }}
                          onKeyDown={e => e.key === "Enter" && handleSendCode()}
                          placeholder="you@holmes.edu.au"
                          autoFocus
                          className="w-full pl-10 pr-4 py-2.5 border border-stone-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleSendCode}
                      disabled={!email.trim() || status === "sending"}
                      className="w-full py-2.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                      {status === "sending" ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : "Send 6-digit code"}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500 text-center">
                      Code sent to <strong>{email}</strong> · expires in 10 minutes
                    </p>
                    {error && (
                      <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">{error}</p>
                    )}
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otpCode}
                      onChange={e => { setOtpCode(e.target.value.replace(/\D/g, "")); setError("") }}
                      onKeyDown={e => e.key === "Enter" && otpCode.length === 6 && handleVerify()}
                      placeholder="000000"
                      autoFocus
                      className="w-full px-4 py-3 border border-stone-200 rounded-xl text-center text-2xl font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 bg-stone-50"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setStatus("idle"); setOtpCode(""); setError("") }}
                        className="flex-1 py-2.5 border border-stone-200 text-stone-500 rounded-lg text-sm font-medium hover:bg-stone-50 transition-colors"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleVerify}
                        disabled={otpCode.length !== 6 || status === "verifying"}
                        className="flex-1 py-2.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                      >
                        {status === "verifying" ? <><Loader2 className="h-4 w-4 animate-spin" />Verifying…</> : "Verify Code"}
                      </button>
                    </div>
                    <button
                      onClick={() => { setStatus("idle"); setOtpCode(""); setError("") }}
                      className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Didn't receive it? Send again
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
