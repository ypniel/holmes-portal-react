import React, { useEffect, useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Users, FileText, CheckCircle, Clock, Plus, ArrowRight, GraduationCap, MapPin, Dot } from "lucide-react"
import { PageContainer } from "../components/Layout"
import { useAuth } from "../lib/auth"
import { fetchDeals, Deal, BADGE_CLASSES } from "../lib/hubspot"
import { initials, formatRelativeTime, BADGE_CLASSES as BC } from "../lib/utils"

export default function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDeals(500)
      .then(setDeals)
      .finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => ({
    total: deals.length,
    offers: deals.filter(d => d.stageLabel.includes("Offer")).length,
    coes: deals.filter(d => d.stageLabel === "Application Complete" || d.stageLabel === "Enrolled").length,
    attention: deals.filter(d =>
      d.stageLabel === "New Application Received" ||
      d.stageLabel === "Documentation Outstanding"
    ).length,
  }), [deals])

  const recent = deals.slice(0, 5)

  return (
    <PageContainer>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-800">
          Welcome back, {user?.fullName?.split(" ")[0] || "Agent"}!
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Here's what's happening with your student applications today.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={<Users className="h-5 w-5 text-red-700" />} bg="bg-red-50" label="Total" value={stats.total} desc="Applications" />
        <StatCard icon={<FileText className="h-5 w-5 text-amber-600" />} bg="bg-amber-50" label="Active" value={stats.offers} desc="Offers Issued" />
        <StatCard icon={<CheckCircle className="h-5 w-5 text-emerald-600" />} bg="bg-emerald-50" label="Success" value={stats.coes} desc="COEs Completed" />
        <StatCard icon={<Clock className="h-5 w-5 text-rose-600" />} bg="bg-rose-50" label="Urgent" value={stats.attention} desc="Requires Attention" />
      </div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">

          {/* Quick Actions */}
          <div className="bg-gradient-to-br from-red-700 to-red-800 rounded-xl p-6 text-white shadow-lg">
            <h2 className="text-lg font-semibold mb-6">Quick Actions</h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
              <QuickAction
                white
                icon={<Plus className="h-4 w-4 text-red-700" />}
                label="New Application"
                sub="Start an inquiry"
                onClick={() => navigate("/applications")}
              />
              <QuickAction
                icon={<Clock className="h-4 w-4 text-white" />}
                label="Requires Attention"
                sub={`${stats.attention} items to action`}
                onClick={() => navigate("/applications")}
              />
              <QuickAction
                icon={<FileText className="h-4 w-4 text-white" />}
                label="Track Status"
                sub="Check progress"
                onClick={() => navigate("/applications")}
              />
              <QuickAction
                icon={<FileText className="h-4 w-4 text-white" />}
                label="Reports"
                sub="Analytics & insights"
                onClick={() => navigate("/applications")}
              />
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Recent Activity</h2>
              <button
                onClick={() => navigate("/applications")}
                className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700 font-medium"
              >
                View All <ArrowRight className="h-4 w-4 ml-1" />
              </button>
            </div>
            <div className="divide-y divide-stone-100">
              {loading && <p className="p-8 text-center text-gray-400 text-sm">Loading recent activity…</p>}
              {!loading && recent.length === 0 && (
                <p className="p-8 text-center text-gray-400 text-sm">No applications yet.</p>
              )}
              {recent.map((deal) => (
                <div
                  key={deal.id}
                  onClick={() => navigate(`/applications/${deal.id}`)}
                  className="p-4 hover:bg-red-50 transition-colors cursor-pointer group"
                >
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center text-red-700 text-xs font-medium flex-shrink-0">
                      {initials(deal.studentName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div>
                          <p className="font-medium text-gray-800 group-hover:text-red-600 transition-colors">
                            {deal.studentName}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                            <span className="flex items-center gap-1">
                              <GraduationCap className="h-3 w-3" />
                              {deal.courseName || "—"}
                            </span>
                            {deal.campus && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {deal.campus}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${BC[deal.stageColor] || BC.stone}`}>
                          {deal.stageLabel}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-stone-400">{deal.nationality}</span>
                        <span className="text-xs text-stone-400">{formatRelativeTime(deal.lastModified)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Agent Profile */}
          <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm">
            <div className="text-center mb-4">
              <div className="h-20 w-20 mx-auto mb-3 rounded-full bg-red-50 border-2 border-red-100 flex items-center justify-center text-red-700 text-2xl font-semibold">
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
              <div className="flex justify-between">
                <span className="text-gray-500">Phone</span>
                <span className="text-gray-800 font-medium">{user?.phone || "N/A"}</span>
              </div>
            </div>
          </div>

          {/* Need Assistance */}
          <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Need Assistance?</h3>
              <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200">
                <Dot className="h-3 w-3 fill-current animate-pulse" />
                <span className="text-xs font-semibold">Live Now</span>
              </div>
            </div>
            <div className="space-y-3 text-sm mb-4">
              <div>
                <p className="text-gray-500">Phone</p>
                <p className="text-gray-900 font-medium">+61 3 9564 1444</p>
              </div>
              <div>
                <p className="text-gray-500">Email</p>
                <p className="text-gray-900 font-medium">admissions@holmes.edu.au</p>
              </div>
            </div>
            <div className="pt-3 border-t border-stone-100">
              <p className="text-xs text-gray-500 font-medium mb-1">Available Hours</p>
              <p className="text-sm text-gray-700">Monday – Friday, 9:00 AM – 5:00 PM AEST</p>
            </div>
          </div>

          {/* Pro Tip */}
          <div className="bg-red-50 rounded-xl border border-red-100 p-5">
            <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-red-600" />
              Pro Tip
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Keep student documents up to date to ensure faster processing times for visa applications.
            </p>
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
        <span className="text-xs font-medium text-stone-400">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-gray-800">{value}</p>
      <p className="text-sm text-gray-500">{desc}</p>
    </div>
  )
}

function QuickAction({ icon, label, sub, onClick, white }: {
  icon: React.ReactNode; label: string; sub: string; onClick: () => void; white?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-3 p-3 rounded-lg text-left transition-colors h-auto ${
        white
          ? "bg-white text-red-700 hover:bg-red-50 shadow-sm"
          : "bg-white/10 hover:bg-white/20 text-white border border-white/20"
      }`}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${white ? "bg-red-50" : "bg-white/10"}`}>
        {icon}
      </div>
      <div>
        <div className={`font-medium text-sm ${white ? "text-red-700" : "text-white"}`}>{label}</div>
        <div className={`text-xs mt-0.5 ${white ? "text-gray-500" : "text-white/70"}`}>{sub}</div>
      </div>
    </button>
  )
}
