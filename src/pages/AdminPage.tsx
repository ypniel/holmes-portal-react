import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Shield, Mail, Lock, Copy, Check, RefreshCw, ArrowLeft, Eye, EyeOff } from "lucide-react"

export default function AdminPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [secret, setSecret] = useState("")
  const [showSecret, setShowSecret] = useState(false)
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [result, setResult] = useState<{ email: string; fullName: string; password: string; contactId: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState("")
  const [copied, setCopied] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus("loading")
    setResult(null)
    setErrorMsg("")

    try {
      const res = await fetch("/.netlify/functions/set-agent-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), adminSecret: secret }),
      })
      const data = await res.json()

      if (!res.ok || !data.ok) {
        setStatus("error")
        setErrorMsg(data.error || "Something went wrong.")
        return
      }

      setStatus("success")
      setResult(data)
    } catch {
      setStatus("error")
      setErrorMsg("Network error. Please try again.")
    }
  }

  const copyPassword = () => {
    if (!result) return
    navigator.clipboard.writeText(result.password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const reset = () => {
    setStatus("idle")
    setResult(null)
    setEmail("")
    setErrorMsg("")
  }

  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Back button */}
        <button
          onClick={() => navigate("/login")}
          className="flex items-center gap-1.5 text-sm text-stone-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-red-900/40 border border-red-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="h-7 w-7 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Agent Password Admin</h1>
          <p className="text-sm text-stone-400 mt-1">Set or reset an agent's portal password</p>
        </div>

        <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-8">

            {status === "success" && result ? (
              <div className="text-center">
                <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="h-6 w-6 text-emerald-600" />
                </div>
                <h2 className="text-lg font-bold text-gray-800 mb-1">Password set</h2>
                <p className="text-sm text-gray-500 mb-6">{result.fullName} · {result.email}</p>

                <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 mb-4">
                  <p className="text-xs text-stone-500 mb-2 font-medium uppercase tracking-wide">Generated password</p>
                  <div className="flex items-center justify-between gap-3">
                    <code className="text-lg font-mono font-bold text-gray-800 tracking-wider">{result.password}</code>
                    <button
                      onClick={copyPassword}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-200 hover:bg-stone-50 rounded-lg text-xs font-medium text-gray-600 transition-colors"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-stone-400 mt-2">Contact ID: {result.contactId} · Last 4: {result.contactId.slice(-4)}</p>
                </div>

                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-left">
                  ⚠️ Send this password to the agent securely then delete it from your records. Do not store plaintext passwords.
                </p>

                <button
                  onClick={reset}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-stone-200 text-sm font-medium text-gray-700 hover:bg-stone-50 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  Set another password
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-bold text-gray-800 mb-6">Set Agent Password</h2>

                {status === "error" && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-600">Agent email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                        disabled={status === "loading"}
                        placeholder="agent@agency.com"
                        autoComplete="off"
                        className="w-full pl-10 pr-4 py-2.5 border border-stone-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-600">Admin secret</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type={showSecret ? "text" : "password"}
                        value={secret}
                        onChange={e => setSecret(e.target.value)}
                        required
                        disabled={status === "loading"}
                        placeholder="••••••••••••"
                        autoComplete="off"
                        className="w-full pl-10 pr-10 py-2.5 border border-stone-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={status === "loading" || !email || !secret}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-opacity"
                    style={{ background: "linear-gradient(135deg, #991b1b, #7f1d1d)" }}
                  >
                    {status === "loading" ? (
                      <><RefreshCw className="h-4 w-4 animate-spin" /> Setting password…</>
                    ) : (
                      <><Shield className="h-4 w-4" /> Set Password</>
                    )}
                  </button>
                </form>

                <p className="mt-4 text-center text-xs text-gray-400">
                  Password formula: <code className="bg-stone-100 px-1 rounded text-stone-600">H0lmesv2_[last4]HI</code>
                </p>
              </>
            )}
          </div>
        </div>

        <p className="mt-3 text-center text-xs text-white/30">Holmes Institute Australia · Admin tools</p>
      </div>
    </div>
  )
}
