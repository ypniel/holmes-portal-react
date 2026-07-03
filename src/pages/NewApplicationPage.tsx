import { useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { useAuth } from "../lib/auth"
import ApplicationForm from "./ApplicationForm"

export default function NewApplicationPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const sessionToken = sessionStorage.getItem("holmes_session_token") || ""

  if (!user) return null

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <div className="bg-white border-b border-stone-200 px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
        <button onClick={() => navigate("/applications")} className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-800">New Application</h1>
          <p className="text-xs text-gray-500">Holmes Institute Australia · Australia Pipeline</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 md:p-8">
          <ApplicationForm
            mode="agent"
            sessionToken={sessionToken}
            prefillEmail={user.email}
            onSuccess={(dealId) => navigate(`/applications/${dealId}`)}
          />
        </div>
      </div>
    </div>
  )
}
