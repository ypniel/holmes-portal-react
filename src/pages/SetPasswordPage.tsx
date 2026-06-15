import { useState, useEffect, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Eye, EyeOff, Lock, CheckCircle, AlertCircle, LoaderCircle, ShieldCheck } from "lucide-react"

export default function SetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error" | "invalidToken">("idle")
  const [errorMsg, setErrorMsg] = useState("")
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    const token = searchParams.get("token")
    if (!token) {
      setStatus("invalidToken")
      return
    }
    tokenRef.current = token
  }, [searchParams])

  const strength = (() => {
    if (!password) return 0
    let score = 0
    if (password.length >= 8) score++
    if (password.length >= 12) score++
    if (/[A-Z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++
    return score
  })()

  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong", "Very strong"][strength]
  const strengthColor = ["", "#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a"][strength]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setErrorMsg("Passwords don't match.")
      return
    }
    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.")
      return
    }

    setStatus("loading")
    setErrorMsg("")

    try {
      const res = await fetch("/.netlify/functions/set-agent-password-self", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenRef.current, password }),
      })
      const data = await res.json()

      if (!res.ok || !data.ok) {
        setStatus("error")
        setErrorMsg(data.error || "Something went wrong. Please try again.")
        return
      }

      setStatus("success")
    } catch {
      setStatus("error")
      setErrorMsg("Network error. Please try again.")
    }
  }

  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center p-4">

      {/* Logo */}
      <div className="absolute top-6 left-8">
        <div className="flex items-center gap-2.5">
          <img
            src="https://holmes.edu.au/templates/images/Logo-base-banner.png"
            alt="Holmes Institute Australia"
            className="h-8 w-auto"
            onError={(e) => { e.currentTarget.style.display = "none" }}
          />
        </div>
      </div>

      <div className="w-full max-w-sm">
        <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-8">

            {/* Invalid token */}
            {status === "invalidToken" && (
              <div className="text-center">
                <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="h-7 w-7 text-red-500" />
                </div>
                <h2 className="text-xl font-bold text-gray-800">Invalid link</h2>
                <p className="mt-2 text-sm text-gray-500">This password reset link is missing or invalid. Please request a new one.</p>
                <button
                  onClick={() => navigate("/agent-login")}
                  className="mt-6 w-full py-2.5 rounded-lg text-white text-sm font-medium"
                  style={{ background: "linear-gradient(135deg, #991b1b, #7f1d1d)" }}
                >
                  Back to Sign In
                </button>
              </div>
            )}

            {/* Success */}
            {status === "success" && (
              <div className="text-center">
                <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-7 w-7 text-emerald-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-800">Password set!</h2>
                <p className="mt-2 text-sm text-gray-500">Your new password has been saved. You can now sign in.</p>
                <button
                  onClick={() => navigate("/agent-login")}
                  className="mt-6 w-full py-2.5 rounded-lg text-white text-sm font-medium"
                  style={{ background: "linear-gradient(135deg, #991b1b, #7f1d1d)" }}
                >
                  Go to Sign In
                </button>
              </div>
            )}

            {/* Form */}
            {(status === "idle" || status === "loading" || status === "error") && (
              <>
                <div className="text-center mb-6">
                  <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <ShieldCheck className="h-7 w-7 text-red-700" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800">Set your password</h2>
                  <p className="mt-1 text-sm text-gray-500">Choose a strong password for your agent account</p>
                </div>

                {errorMsg && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700">{errorMsg}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-600">New password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={e => { setPassword(e.target.value); setErrorMsg("") }}
                        required
                        disabled={status === "loading"}
                        placeholder="Minimum 8 characters"
                        autoFocus
                        className="w-full pl-10 pr-10 py-2.5 border border-stone-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:opacity-50"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {/* Strength bar */}
                    {password && (
                      <div className="space-y-1">
                        <div className="flex gap-1">
                          {[1,2,3,4,5].map(i => (
                            <div key={i} className="flex-1 h-1 rounded-full transition-colors duration-200"
                              style={{ background: i <= strength ? strengthColor : "#e5e7eb" }} />
                          ))}
                        </div>
                        <p className="text-xs" style={{ color: strengthColor }}>{strengthLabel}</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-600">Confirm password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type={showConfirm ? "text" : "password"}
                        value={confirm}
                        onChange={e => { setConfirm(e.target.value); setErrorMsg("") }}
                        required
                        disabled={status === "loading"}
                        placeholder="Re-enter your password"
                        className="w-full pl-10 pr-10 py-2.5 border border-stone-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:opacity-50"
                      />
                      <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {confirm && password && confirm === password && (
                      <p className="text-xs text-emerald-600 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Passwords match
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={status === "loading" || !password || !confirm}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-opacity"
                    style={{ background: "linear-gradient(135deg, #991b1b, #7f1d1d)" }}
                  >
                    {status === "loading" ? (
                      <><LoaderCircle className="h-4 w-4 animate-spin" />Saving…</>
                    ) : (
                      <><ShieldCheck className="h-4 w-4" />Save Password</>
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-white/30">
          © {new Date().getFullYear()} Holmes Institute Australia. All rights reserved.
        </p>
      </div>
    </div>
  )
}
