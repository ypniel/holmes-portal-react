import React, { useEffect, useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Users, FileText, CheckCircle, Clock, ArrowRight, GraduationCap, MapPin } from "lucide-react"
import { PageContainer } from "../components/Layout"
import { useAuth } from "../lib/auth"
import { fetchDeals, Deal } from "../lib/hubspot"
import { initials, formatRelativeTime, BADGE_CLASSES as BC } from "../lib/utils"

// ── Rotating Pro Tips ─────────────────────────────────────────────────────────
const PRO_TIPS = [
  "Keep student documents up to date to ensure faster processing times for visa applications.",
  "Submit IELTS or English test results early — verification delays are the most common cause of offer letter hold-ups.",
  "Double-check passport expiry dates before submitting — passports must be valid for at least 6 months beyond the course end date.",
  "Ensure the student's name on all documents exactly matches the passport. Discrepancies cause significant delays.",
  "OSHC must be arranged before the COE can be issued. Remind students to arrange health cover early.",
  "Advanced Standing applications take longer to assess — submit these cases as early as possible before intake.",
  "For onshore students, make sure their current visa allows them to study before submitting an application.",
]

function useRotatingTip() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % PRO_TIPS.length), 8000)
    return () => clearInterval(t)
  }, [])
  return PRO_TIPS[idx]
}

// ── Live/Closed status ────────────────────────────────────────────────────────
function useLiveStatus() {
  const [isLive, setIsLive] = useState(false)
  useEffect(() => {
    const check = () => {
      // Force Melbourne timezone
      const melbStr = new Date().toLocaleString("en-AU", { timeZone: "Australia/Melbourne", hour12: false })
      // Parse "dd/mm/yyyy, HH:MM:SS"
      const parts = melbStr.split(", ")
      if (parts.length < 2) return
      const timePart = parts[1] // "HH:MM:SS"
      const h = parseInt(timePart.split(":")[0])
      const datePart = parts[0] // "dd/mm/yyyy"
      const dateSegments = datePart.split("/")
      const day = new Date(
        parseInt(dateSegments[2]),
        parseInt(dateSegments[1]) - 1,
        parseInt(dateSegments[0])
      ).getDay() // 0=Sun, 6=Sat
      const isWeekday = day >= 1 && day <= 5
      setIsLive(isWeekday && h >= 9 && h < 17)
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])
  return isLive
}

const NEW_APP_URL = "https://share.hsforms.com/2nrqky_hbSQu2wZj0XxTnVgnrkx6"

export default function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const tip = useRotatingTip()
  const isLive = useLiveStatus()

  useEffect(() => {
    fetchDeals(500).then(setDeals).finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => ({
    total: deals.length,
    offers: deals.filter(d => d.stageLabel.includes("Offer")).length,
    coes: deals.filter(d => d.stageLabel === "Application Completed" || d.stageLabel === "Enrolled").length,
    waiting: deals.filter(d => d.responseStatus.toLowerCase().includes("waiting")).length,
  }), [deals])

  const recent = deals.slice(0, 5)

  const STATUS_DISP: Record<string, [string, string]> = {
    "New Application Received":   ["Assessment In Progress", "#1d4ed8"],
    "Documentation Outstanding":  ["Document Check",         "#6d28d9"],
    "Offer Issued":               ["Offer Issued",           "#b45309"],
    "Conditional Offer Issued":   ["Conditional Offer",      "#b45309"],
    "Offer Letter Requested":     ["Offer Requested",        "#b45309"],
    "Receipting":                 ["Receipting",             "#b45309"],
    "COE Request":                ["COE Request",            "#047857"],
    "COE Team":                   ["COE Team",               "#047857"],
    "Application Completed":      ["Completed",              "#047857"],
    "Enrolled":                   ["Enrolled",               "#047857"],
    "Application Refused":        ["Refused",                "#b91c1c"],
    "Application Closed":         ["Closed",                 "#57534e"],
    "GTE in Process":             ["GTE in Process",         "#b45309"],
    "Credit Assessment Team":     ["Credit Assessment",      "#b45309"],
  }

  return (
    <PageContainer>
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-800">
          Welcome back, {user?.fullName?.split(" ")[0] || "Agent"}!
        </h1>
        <p className="text-sm text-gray-500 mt-1">Here's what's happening with your student applications today.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={<Users className="h-5 w-5 text-red-700" />}     bg="bg-red-50"     label="Total"   value={stats.total}   desc="Applications" />
        <StatCard icon={<FileText className="h-5 w-5 text-amber-600" />} bg="bg-amber-50"   label="Active"  value={stats.offers}  desc="Offers Issued" />
        <StatCard icon={<CheckCircle className="h-5 w-5 text-emerald-600" />} bg="bg-emerald-50" label="Success" value={stats.coes} desc="COEs Completed" />
        <StatCard icon={<Clock className="h-5 w-5 text-rose-600" />}    bg="bg-rose-50"    label="Requires Action / Waiting on Agent" value={stats.waiting} desc="Waiting on Agent" />
      </div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Quick Actions */}
          <div className="bg-gradient-to-br from-red-700 to-red-800 rounded-xl p-6 text-white shadow-lg">
            <h2 className="text-lg font-semibold mb-5">Quick Actions</h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* New Application → HubSpot form */}
              <a href={NEW_APP_URL} target="_blank" rel="noopener noreferrer"
                className="bg-white rounded-lg p-4 flex items-start gap-3 hover:bg-red-50 transition-colors"
              >
                <div className="w-8 h-8 bg-red-50 rounded-full flex items-center justify-center text-red-700 flex-shrink-0">➕</div>
                <div>
                  <div className="font-semibold text-sm text-red-700">New Application</div>
                  <div className="text-xs text-gray-500 mt-0.5">Start an inquiry</div>
                </div>
              </a>

              {/* Waiting on Agent */}
              <button onClick={() => navigate("/applications")}
                className="bg-white/10 border border-white/20 rounded-lg p-4 flex items-start gap-3 hover:bg-white/20 transition-colors text-left"
              >
                <div className="w-8 h-8 bg-white/15 rounded-full flex items-center justify-center flex-shrink-0">⏳</div>
                <div>
                  <div className="font-semibold text-sm text-white">Waiting on Agent</div>
                  <div className="text-xs text-white/60 mt-0.5">{stats.waiting} items waiting on Agent</div>
                </div>
              </button>

              <button onClick={() => navigate("/applications")}
                className="bg-white/10 border border-white/20 rounded-lg p-4 flex items-start gap-3 hover:bg-white/20 transition-colors text-left"
              >
                <div className="w-8 h-8 bg-white/15 rounded-full flex items-center justify-center flex-shrink-0">💬</div>
                <div>
                  <div className="font-semibold text-sm text-white">Messages</div>
                  <div className="text-xs text-white/60 mt-0.5">Check communications</div>
                </div>
              </button>

              <button onClick={() => navigate("/applications")}
                className="bg-white/10 border border-white/20 rounded-lg p-4 flex items-start gap-3 hover:bg-white/20 transition-colors text-left"
              >
                <div className="w-8 h-8 bg-white/15 rounded-full flex items-center justify-center flex-shrink-0">📊</div>
                <div>
                  <div className="font-semibold text-sm text-white">Reports</div>
                  <div className="text-xs text-white/60 mt-0.5">Analytics &amp; insights</div>
                </div>
              </button>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Recent Activity</h2>
              <button onClick={() => navigate("/applications")}
                className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700 font-medium"
              >
                View All <ArrowRight className="h-4 w-4 ml-1" />
              </button>
            </div>
            <div className="divide-y divide-stone-100">
              {loading && <p className="p-8 text-center text-gray-400 text-sm animate-pulse">Loading…</p>}
              {!loading && recent.length === 0 && <p className="p-8 text-center text-gray-400 text-sm">No applications yet.</p>}
              {recent.map(deal => {
                const [dispStatus, color] = STATUS_DISP[deal.stageLabel] || [deal.stageLabel, "#57534e"]
                return (
                  <div key={deal.id} onClick={() => navigate(`/applications/${deal.id}`)}
                    className="p-4 hover:bg-red-50 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center text-red-700 text-xs font-medium flex-shrink-0">
                        {initials(deal.studentName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div>
                            <p className="font-medium text-gray-800 group-hover:text-red-600 transition-colors">{deal.studentName}</p>
                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5 flex-wrap">
                              {deal.courseName && (
                                <span className="flex items-center gap-1">
                                  <GraduationCap className="h-3 w-3" />{deal.courseName}
                                </span>
                              )}
                              {deal.campus && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />{deal.campus}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-xs font-semibold flex-shrink-0" style={{ color }}>{dispStatus}</span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-stone-400">{deal.nationality}</span>
                          <span className="text-xs text-stone-400">{formatRelativeTime(deal.lastModified)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-5">
          {/* Agent Profile */}
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <div className="text-center mb-4">
              <div className="h-16 w-16 mx-auto mb-3 rounded-full bg-red-50 border-2 border-red-100 flex items-center justify-center text-red-700 text-2xl font-semibold">
                {initials(user?.fullName)}
              </div>
              <h3 className="font-semibold text-gray-800">{user?.fullName || "Agent"}</h3>
              <p className="text-sm text-gray-500">{user?.companyName || "Holmes Education Group"}</p>
            </div>
            <div className="space-y-2 text-sm border-t border-stone-100 pt-4">
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span className="text-gray-800 font-medium truncate ml-4">{user?.email}</span>
              </div>
            </div>
          </div>

          {/* Need Assistance — live/closed */}
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">Need Assistance?</h3>
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${
                isLive
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-stone-100 text-stone-500 border-stone-200"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-stone-400"}`} />
                {isLive ? "Live Now" : "Closed"}
              </div>
            </div>
            <div className="space-y-2 text-sm mb-3">
              <div><p className="text-gray-500 text-xs">Phone</p><p className="font-medium text-gray-900">+61 3 9564 1444</p></div>
              <div><p className="text-gray-500 text-xs">Email</p><p className="font-medium text-gray-900">admissions@holmes.edu.au</p></div>
            </div>
            <div className="pt-3 border-t border-stone-100">
              <p className="text-xs text-gray-500">Monday – Friday, 9:00 AM – 5:00 PM AEST</p>
            </div>
          </div>

          {/* Rotating Pro Tip */}
          <div className="bg-red-50 rounded-xl border border-red-100 p-5">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
              <h3 className="font-semibold text-gray-800 text-sm">Pro Tip</h3>
            </div>
            <p key={tip} className="text-sm text-gray-600 leading-relaxed transition-all duration-500">{tip}</p>
          </div>

          {/* Direct Student option */}
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <h3 className="font-semibold text-gray-800 text-sm mb-2">Direct Student?</h3>
            <p className="text-xs text-gray-500 mb-3">Not applying through an agent? Register directly as an applicant.</p>
            <a href="https://share.hsforms.com/295xCp21qRwiF7dm8byV6SQnrkx6" target="_blank" rel="noopener noreferrer"
              className="block w-full text-center py-2 px-4 bg-red-700 hover:bg-red-800 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Register as Applicant
            </a>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}

function StatCard({ icon, bg, label, value, desc }: {
  icon: React.ReactNode; bg: string; label: string; value: number; desc: string
}) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center`}>{icon}</div>
      </div>
      <p className="text-2xl font-semibold text-gray-800">{value}</p>
      <p className="text-sm text-gray-500">{desc}</p>
    </div>
  )
}
