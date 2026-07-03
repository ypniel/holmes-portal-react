import { useState } from "react"
import { Shield, Mail, Lock, Copy, Check, RefreshCw, Send, UserPlus, AlertCircle, ArrowLeft } from "lucide-react"

type Tab = "invite" | "setPassword"

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("invite")
  const [secret, setSecret] = useState("")

  // Invite state
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteStatus, setInviteStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [inviteResult, setInviteResult] = useState<{ fullName: string; email: string } | null>(null)
  const [inviteError, setInviteError] = useState("")

  // Set password state
  const [pwEmail, setPwEmail] = useState("")
  const [pwStatus, setPwStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [pwResult, setPwResult] = useState<{ fullName: string; password: string; contactId: string } | null>(null)
  const [pwError, setPwError] = useState("")
  const [copied, setCopied] = useState(false)

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteStatus("loading")
    setInviteError("")
    setInviteResult(null)
    try {
      const res = await fetch("/.netlify/functions/send-agent-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), adminSecret: secret }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setInviteStatus("error")
        setInviteError(data.error || "Something went wrong.")
        return
      }
      setInviteStatus("success")
      setInviteResult(data)
    } catch {
      setInviteStatus("error")
      setInviteError("Network error. Please try again.")
    }
  }

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwStatus("loading")
    setPwError("")
    setPwResult(null)
    try {
      const res = await fetch("/.netlify/functions/set-agent-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pwEmail.trim().toLowerCase(), adminSecret: secret }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setPwStatus("error")
        setPwError(data.error || "Something went wrong.")
        return
      }
      setPwStatus("success")
      setPwResult(data)
    } catch {
      setPwStatus("error")
      setPwError("Network error. Please try again.")
    }
  }

  const copyPassword = () => {
    if (!pwResult) return
    navigator.clipboard.writeText(pwResult.password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const resetInvite = () => { setInviteStatus("idle"); setInviteEmail(""); setInviteError(""); setInviteResult(null) }
  const resetPw = () => { setPwStatus("idle"); setPwEmail(""); setPwError(""); setPwResult(null) }

  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-red-900/40 border border-red-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="h-7 w-7 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Agent Portal Admin</h1>
          <p className="text-sm text-stone-400 mt-1">Invite agents or manage passwords</p>
        </div>

        <div className="mb-4 flex justify-center">
          <a
            href="/login"
            className="flex items-center gap-1.5 text-white/40 hover:text-white/70 transition-colors text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to welcome page</span>
          </a>
        </div>

        <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl overflow-hidden">

          {/* Tabs */}
          <div className="flex border-b border-stone-200">
            <button
              onClick={() => setTab("invite")}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-colors ${tab === "invite" ? "text-red-700 border-b-2 border-red-700 bg-red-50/50" : "text-gray-500 hover:text-gray-700"}`}
            >
              <UserPlus className="h-4 w-4" />
              Invite Agent
            </button>
            <button
              onClick={() => setTab("setPassword")}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-colors ${tab === "setPassword" ? "text-red-700 border-b-2 border-red-700 bg-red-50/50" : "text-gray-500 hover:text-gray-700"}`}
            >
              <Lock className="h-4 w-4" />
              Set Password
            </button>
          </div>

          <div className="p-8">

            {/* Shared admin secret */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Admin secret</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="password"
                  value={secret}
                  onChange={e => setSecret(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="off"
                  className="w-full pl-10 pr-4 py-2.5 border border-stone-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                />
              </div>
            </div>

            {/* ── INVITE TAB ── */}
            {tab === "invite" && (
              <>
                {inviteStatus === "success" && inviteResult ? (
                  <div className="text-center">
                    <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Check className="h-6 w-6 text-emerald-600" />
                    </div>
                    <h2 className="text-lg font-bold text-gray-800 mb-1">Invite sent!</h2>
                    <p className="text-sm text-gray-500 mb-2">{inviteResult.fullName}</p>
                    <p className="text-sm text-gray-400 mb-6">{inviteResult.email}</p>
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-left">
                      The agent has 24 hours to click the link and set their password before it expires.
                    </p>
                    <button onClick={resetInvite}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-stone-200 text-sm font-medium text-gray-700 hover:bg-stone-50 transition-colors">
                      <RefreshCw className="h-4 w-4" /> Invite another agent
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-gray-500 mb-4">
                      Sends the agent an email with a secure link to set up their own password. Link expires in 24 hours.
                    </p>
                    {inviteStatus === "error" && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                        <p className="text-sm text-red-700">{inviteError}</p>
                      </div>
                    )}
                    <form onSubmit={handleInvite} className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-gray-600">Agent email</label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <input
                            type="email"
                            value={inviteEmail}
                            onChange={e => setInviteEmail(e.target.value)}
                            required
                            disabled={inviteStatus === "loading"}
                            placeholder="agent@agency.com"
                            autoComplete="off"
                            className="w-full pl-10 pr-4 py-2.5 border border-stone-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:opacity-50"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={inviteStatus === "loading" || !inviteEmail || !secret}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-opacity"
                        style={{ background: "linear-gradient(135deg, #991b1b, #7f1d1d)" }}
                      >
                        {inviteStatus === "loading" ? (
                          <><RefreshCw className="h-4 w-4 animate-spin" />Sending invite…</>
                        ) : (
                          <><Send className="h-4 w-4" />Send Invite Email</>
                        )}
                      </button>
                    </form>
                  </>
                )}
              </>
            )}

            {/* ── SET PASSWORD TAB ── */}
            {tab === "setPassword" && (
              <>
                {pwStatus === "success" && pwResult ? (
                  <div className="text-center">
                    <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Check className="h-6 w-6 text-emerald-600" />
                    </div>
                    <h2 className="text-lg font-bold text-gray-800 mb-1">Password set</h2>
                    <p className="text-sm text-gray-500 mb-6">{pwResult.fullName}</p>
                    <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 mb-4">
                      <p className="text-xs text-stone-500 mb-2 font-medium uppercase tracking-wide">Generated password</p>
                      <div className="flex items-center justify-between gap-3">
                        <code className="text-lg font-mono font-bold text-gray-800 tracking-wider">{pwResult.password}</code>
                        <button onClick={copyPassword}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-200 hover:bg-stone-50 rounded-lg text-xs font-medium text-gray-600 transition-colors">
                          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                          {copied ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <p className="text-xs text-stone-400 mt-2">Contact ID: {pwResult.contactId} · Last 4: {pwResult.contactId.slice(-4)}</p>
                    </div>
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-left">
                      ⚠️ Send this password to the agent securely then delete it from your records.
                    </p>
                    <button onClick={resetPw}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-stone-200 text-sm font-medium text-gray-700 hover:bg-stone-50 transition-colors">
                      <RefreshCw className="h-4 w-4" /> Set another password
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-gray-500 mb-4">
                      Generates a temporary password and saves it to HubSpot. Use this as a fallback if the invite email doesn't work.
                    </p>
                    {pwStatus === "error" && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                        <p className="text-sm text-red-700">{pwError}</p>
                      </div>
                    )}
                    <form onSubmit={handleSetPassword} className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-gray-600">Agent email</label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <input
                            type="email"
                            value={pwEmail}
                            onChange={e => setPwEmail(e.target.value)}
                            required
                            disabled={pwStatus === "loading"}
                            placeholder="agent@agency.com"
                            autoComplete="off"
                            className="w-full pl-10 pr-4 py-2.5 border border-stone-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:opacity-50"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={pwStatus === "loading" || !pwEmail || !secret}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-opacity"
                        style={{ background: "linear-gradient(135deg, #991b1b, #7f1d1d)" }}
                      >
                        {pwStatus === "loading" ? (
                          <><RefreshCw className="h-4 w-4 animate-spin" />Setting password…</>
                        ) : (
                          <><Shield className="h-4 w-4" />Set Password</>
                        )}
                      </button>
                    </form>
                    <p className="mt-4 text-center text-xs text-gray-400">
                      Formula: <code className="bg-stone-100 px-1 rounded text-stone-600">H0lmesv2_[last4]HI</code>
                    </p>
                  </>
                )}
              </>
            )}

          </div>
        </div>
        <p className="mt-3 text-center text-xs text-white/30">Holmes Institute Australia · Admin tools</p>
      </div>
    </div>
  )
}
