import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { LogOut } from "lucide-react"
import ApplicationForm from "./ApplicationForm"

export default function StudentApplyPage() {
  const navigate = useNavigate()
  const [session, setSession] = useState<{ email: string; fullName: string; sessionToken: string } | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem("holmes_student")
    if (!raw) { navigate("/student", { replace: true }); return }
    const parsed = JSON.parse(raw)
    if (!parsed.sessionToken) { navigate("/student", { replace: true }); return }
    if (parsed.dealId) { navigate(`/student/application/${parsed.dealId}`, { replace: true }); return }
    setSession({ email: parsed.email, fullName: parsed.fullName, sessionToken: parsed.sessionToken })
  }, [navigate])

  const handleLogout = () => {
    sessionStorage.removeItem("holmes_student")
    navigate("/student", { replace: true })
  }

  const handleSuccess = (dealId: string) => {
    const raw = sessionStorage.getItem("holmes_student")
    if (raw) {
      const parsed = JSON.parse(raw)
      sessionStorage.setItem("holmes_student", JSON.stringify({ ...parsed, dealId }))
    }
  }

  if (!session) return null

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <div className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <img
            src="https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/EDM%20Headers%20(1).png"
            alt="Holmes Institute Australia"
            className="h-7 w-auto"
            onError={(e) => { e.currentTarget.style.display = "none" }}
          />
          <div>
            <h1 className="text-base font-bold text-gray-800">New Application</h1>
            <p className="text-xs text-gray-500">Holmes Institute Australia</p>
          </div>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-600 transition-colors">
          <LogOut className="h-3.5 w-3.5" />Sign out
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 md:p-8">
          <ApplicationForm
            mode="student"
            sessionToken={session.sessionToken}
            prefillEmail={session.email}
            prefillName={session.fullName}
            onSuccess={handleSuccess}
          />
        </div>
      </div>
    </div>
  )
}
