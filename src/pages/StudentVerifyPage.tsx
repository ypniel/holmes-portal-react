import { useState, useEffect, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { LoaderCircle, AlertCircle, GraduationCap } from "lucide-react"


export default function StudentVerifyPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<"verifying" | "error">("verifying")
  const [errorMessage, setErrorMessage] = useState<string>("")
  const ranRef = useRef(false)

  useEffect(() => {
    // Guard against double-run in React StrictMode
    if (ranRef.current) return
    ranRef.current = true

    const token = searchParams.get("token")
    if (!token) {
      setStatus("error")
      setErrorMessage("This link is missing its security token. Please request a new login link.")
      return
    }

    const verify = async () => {
      try {
        const res = await fetch("/.netlify/functions/verify-magic-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })
        const data = await res.json()

        if (!res.ok || !data.ok) {
          setStatus("error")
          setErrorMessage(data.error || "This link is invalid or has expired. Please request a new one.")
          return
        }

        // Store the verified session — includes the signed sessionToken
        // and the server-confirmed dealId (which may be null if they
        // haven't submitted an application yet).
        sessionStorage.setItem("holmes_student", JSON.stringify({
          email: data.student.email,
          fullName: data.student.fullName,
          dealId: data.student.dealId,
          sessionToken: data.sessionToken,
        }))

        if (data.student.dealId) {
          // Has an application — go straight to it
          navigate(`/student/application/${data.student.dealId}`, { replace: true })
        } else {
          // Logged in but no application yet — prompt them to apply
          navigate("/student/apply", { replace: true })
        }
      } catch {
        setStatus("error")
        setErrorMessage("Something went wrong verifying your link. Please try again.")
      }
    }

    verify()
  }, [searchParams, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden animated-bg">

      <div className="w-full max-w-sm relative z-10">
        <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
          <div className="p-8 text-center">
            {status === "verifying" && (
              <>
                <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <LoaderCircle className="h-7 w-7 text-red-700 animate-spin" />
                </div>
                <h2 className="text-xl font-bold text-gray-800">Signing you in…</h2>
                <p className="mt-1 text-sm text-gray-500">Verifying your secure link.</p>
              </>
            )}

            {status === "error" && (
              <>
                <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="h-7 w-7 text-red-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-800">Link not valid</h2>
                <p className="mt-2 text-sm text-gray-500">{errorMessage}</p>
                <button
                  onClick={() => navigate("/student")}
                  className="mt-6 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #991b1b, #7f1d1d)" }}
                >
                  <GraduationCap className="h-4 w-4" />
                  Request a new link
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
