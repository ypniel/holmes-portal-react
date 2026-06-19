import React, { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useAuth } from "../lib/auth"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"

export default function AgentMagicLinkPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { login } = useAuth()
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying")
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    const token = searchParams.get("token")
    if (!token) {
      setStatus("error")
      setErrorMsg("No login token found. Please request a new link.")
      return
    }

    const verify = async () => {
      try {
        const res = await fetch("/.netlify/functions/verify-agent-magic-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })
        const data = await res.json()

        if (!res.ok || !data.ok) {
          setStatus("error")
          setErrorMsg(data.error || "This link is invalid or has expired.")
          return
        }

        // Log in using the same flow as password login
        sessionStorage.setItem("holmes_session_token", data.sessionToken)
        if (data.user.companyId) {
          sessionStorage.setItem("holmes_company_id", data.user.companyId)
        }
        login({
          id: data.user.contactId || "agent",
          name: data.user.fullName?.split(" ")[0] || data.user.email.split("@")[0],
          fullName: data.user.fullName,
          email: data.user.email,
          companyName: data.user.companyName || "",
          companyId: data.user.companyId ? String(data.user.companyId) : undefined,
        })

        setStatus("success")
        setTimeout(() => navigate("/applications", { replace: true }), 1000)
      } catch {
        setStatus("error")
        setErrorMsg("Something went wrong. Please try again.")
      }
    }

    verify()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-900 via-red-950 to-stone-900 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-sm text-center">
        <img
          src="https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/EDM%20Headers%20(1).png"
          alt="Holmes Institute"
          className="h-10 object-contain mx-auto mb-8"
        />

        {status === "verifying" && (
          <>
            <Loader2 className="h-10 w-10 text-red-700 animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-800">Logging you in…</h2>
            <p className="text-sm text-gray-400 mt-2">Please wait a moment</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-800">You're in!</h2>
            <p className="text-sm text-gray-400 mt-2">Redirecting to your applications…</p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="h-10 w-10 text-red-600 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-800">Link expired or invalid</h2>
            <p className="text-sm text-gray-500 mt-2 mb-6">{errorMsg}</p>
            <button
              onClick={() => navigate("/agent-login", { replace: true })}
              className="w-full py-2.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  )
}
