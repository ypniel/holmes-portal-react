import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AuroraBackground } from "../components/AuroraBackground"
import { GraduationCap, FileText, LogOut, RefreshCw } from "lucide-react"

const HOLMES_AURORA = ["#991b1b", "#b91c1c", "#7f1d1d"]
const APPLICATION_FORM_URL = "https://share.hsforms.com/2nrqky_hbSQu2wZj0XxTnVgnrkx6"

export default function StudentApplyPage() {
  const navigate = useNavigate()
  const [session, setSession] = useState<{ email: string; fullName: string } | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem("holmes_student")
    if (!raw) { navigate("/student", { replace: true }); return }
    const parsed = JSON.parse(raw)
    if (!parsed.sessionToken) { navigate("/student", { replace: true }); return }
    // If they somehow already have a dealId, send them to their application
    if (parsed.dealId) { navigate(`/student/application/${parsed.dealId}`, { replace: true }); return }
    setSession({ email: parsed.email, fullName: parsed.fullName })
  }, [navigate])

  // Re-check whether an application has appeared (after they submit the form)
  const handleRefresh = async () => {
    const raw = sessionStorage.getItem("holmes_student")
    if (!raw) return
    const parsed = JSON.parse(raw)
    setChecking(true)
    try {
      const res = await fetch("/.netlify/functions/student-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: parsed.sessionToken }),
      })
      const data = await res.json()
      if (res.ok && data.ok && data.dealId) {
        // Application now exists — update session and go to it
        sessionStorage.setItem("holmes_student", JSON.stringify({ ...parsed, dealId: data.dealId }))
        navigate(`/student/application/${data.dealId}`, { replace: true })
      } else {
        setChecking(false)
      }
    } catch {
      setChecking(false)
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem("holmes_student")
    navigate("/student", { replace: true })
  }

  const firstName = session?.fullName?.split(" ")[0] || ""

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
            <span className="text-red-200 text-xs leading-none mt-0.5">Admissions Direct Student Portal</span>
          </div>
        </div>
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
          <div className="p-8 text-center">
            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <GraduationCap className="h-7 w-7 text-red-700" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">
              Welcome{firstName ? `, ${firstName}` : ""}!
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              You're signed in, but you haven't started an application yet.
              Complete the application form to get started.
            </p>

            <a
              href={`${APPLICATION_FORM_URL}?email=${encodeURIComponent(session?.email || "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 w-full flex items-center justify-center gap-2 py-3 rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #991b1b, #7f1d1d)" }}
            >
              <FileText className="h-4 w-4" />
              Start My Application
            </a>

            <div className="mt-6 pt-5 border-t border-stone-100">
              <p className="text-xs text-gray-500 mb-3">
                Already submitted the form? It can take a moment to appear.
              </p>
              <button
                onClick={handleRefresh}
                disabled={checking}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-stone-200 text-sm font-medium text-gray-700 hover:bg-stone-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
                {checking ? "Checking…" : "I've submitted — check now"}
              </button>
              <button
                onClick={handleLogout}
                className="mt-3 w-full flex items-center justify-center gap-2 text-xs text-gray-400 hover:text-red-600 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
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
