import React, { useEffect, useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Users, FileText, CheckCircle, Clock, ArrowRight, GraduationCap, MapPin } from "lucide-react"
import { PageContainer } from "../components/Layout"
import { useAuth, isHolmesStaff } from "../lib/auth"
import { fetchDeals, fetchDealsByCompanyId, Deal } from "../lib/hubspot"
import { initials, formatRelativeTime, BADGE_CLASSES as BC } from "../lib/utils"
import { StatCardSkeleton, ActivityRowSkeleton } from "../components/Skeleton"

const PRO_TIPS = [
  "Keep student documents up to date to ensure faster processing times for offer letter and COE applications.",
  "Submit Australian academic transcript or English test results early — verification delays are the most common cause of offer letter and COE hold-ups.",
  "Ensure the student's name on all documents exactly matches the passport. Discrepancies cause significant delays.",
  "Advanced Standing applications take longer to assess — submit these cases as early as possible before intake.",
  "For onshore students, make sure their current visa allows them to study before submitting an application.",
  "Always remember to submit passport, English test, offshore and onshore transcript, OSHC and WWCC/Blue Card (for Teaching related courses).",
]

function useRotatingTip() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % PRO_TIPS.length), 8000)
    return () => clearInterval(t)
  }, [])
  return PRO_TIPS[idx]
}

function useLiveStatus() {
  const [isLive, setIsLive] = useState(false)
  useEffect(() => {
    const check = () => {
      const melbStr = new Date().toLocaleString("en-AU", { timeZone: "Australia/Melbourne", hour12: false })
      const parts = melbStr.split(", ")
      if (parts.length < 2) return
      const h = parseInt(parts[1].split(":")[0])
      const dateSegments = parts[0].split("/")
      const day = new Date(parseInt(dateSegments[2]), parseInt(dateSegments[1]) - 1, parseInt(dateSegments[0])).getDay()
      setIsLive(day >= 1 && day <= 5 && h >= 9 && h < 17)
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])
  return isLive
}

const MARKETERS = [
  { name: "Indra Adhikari",  title: "Victoria Representative",       email: "iadhikari@holmes.edu.au" },
  { name: "Dinesh Chetwani", title: "Queensland Representative",      email: "dchetwani@holmes.edu.au" },
  { name: "Don Kauffman",    title: "New South Wales Representative", email: "dkauffman@holmes.edu.au" },
]

const TEAMS = [
  { name: "Agent Finance",             email: "agentfinance@holmes.edu.au",   description: "Commissions enquiries" },
  { name: "Hello",                     email: "hello@holmes.edu.au",           description: "General enquiries" },
  { name: "Deposit",                   email: "deposits@holmes.edu.au",        description: "Payment enquiries" },
  { name: "Student Services",          email: "studentservices@holmes.edu.au", description: "Deferment, suspension, cancellation and appeal enquiries" },
  { name: "Credit Assessment Team",    email: "CAT@holmes.edu.au",             description: "Transfer credit assessment / enquiries" },
  { name: "Early Childhood Placement", email: "ecplacement@holmes.edu.au",     description: "Work placement for GDEC / Master of Teaching students enquiries" },
]

const BASE_APP_URL = "https://share.hsforms.com/2SycknjhmRRasYVCAV33Vkwnrkx6"

export default function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formUrl, setFormUrl] = useState(BASE_APP_URL)
  const tip = useRotatingTip()
  const tipIdx = PRO_TIPS.indexOf(tip)
  const isLive = useLiveStatus()

  useEffect(() => {
    if (!user?.email || isHolmesStaff(user.email)) return
    setFormUrl(`${BASE_APP_URL}?email=${encodeURIComponent(user.email)}`)
  }, [user])

  function exportCSV() {
    const rows = [
      ["Student Name","Nationality","Residency","Course","Intake","Campus","Response Status","Case Status","Last Modified"],
      ...deals.map(d => [d.studentName, d.nationality, d.residencyStatus, d.courseName, d.intake, d.campus, d.responseStatus, d.stageLabel, d.lastModified])
    ]
    // Add UTF-8 BOM for Excel compatibility
    const bom = "\uFEFF"
    const csv = bom + rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g,'""')}"`).join(",")).join("\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    a.download = "Holmes_Applications.csv"
    a.click()
  }

  useEffect(() => {
    const load = async () => {
      try {
        // Fix #4: use isHolmesStaff() instead of manual domain check with precedence bug
        if (user?.email && !isHolmesStaff(user.email)) {
          // Agent — fetch deals by company association
          const companyId = sessionStorage.getItem("holmes_company_id")
          if (companyId) {
            const d = await fetchDealsByCompanyId(companyId)
            setDeals(d)
          } else {
            setDeals([])
          }
        } else {
          // Holmes staff — fetch all deals
          const d = await fetchDeals()
          setDeals(d)
        }
      } catch {}
      finally { setLoading(false) }
    }
    load()
  }, [user])

  const stats = useMemo(() => ({
    total:   deals.length,
    offers:  deals.filter(d => d.stageLabel.includes("Offer")).length,
    coes:    deals.filter(d => d.stageLabel === "Application Completed" || d.stageLabel === "Enrolled").length,
    waiting: deals.filter(d => d.responseStatus.toLowerCase().includes("waiting")).length,
  }), [deals])

  const recent = [...deals]
    .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
    .slice(0, 5)

  return (
    <PageContainer>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-800">
          Welcome back, {user?.fullName?.split(" ")[0] || "Agent"}!
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {user?.email && isHolmesStaff(user.email)
            ? "You are viewing all applications across the Australia Admissions Pipeline."
            : "Here's what's happening with your student applications today."
          }
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {loading ? [1,2,3,4].map(i => <StatCardSkeleton key={i} />) : (
          <>
            <StatCard icon={<Users className="h-5 w-5 text-red-700" />}          bg="bg-red-50"     label="Total"         value={stats.total}   desc="Applications" />
            <StatCard icon={<FileText className="h-5 w-5 text-amber-600" />}      bg="bg-amber-50"   label="Active"        value={stats.offers}  desc="Offers Issued" />
            <StatCard icon={<CheckCircle className="h-5 w-5 text-emerald-600" />} bg="bg-emerald-50" label="Success"       value={stats.coes}    desc="COEs Completed" />
            <StatCard icon={<Clock className="h-5 w-5 text-rose-600" />}          bg="bg-rose-50"    label="Action Required" value={stats.waiting} desc="Action Required" />
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          <div className="bg-gradient-to-br from-red-700 to-red-800 rounded-xl p-6 text-white shadow-lg">
            <h2 className="text-lg font-semibold mb-5">Quick Actions</h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
              <a href={formUrl} target="_blank" rel="noopener noreferrer"
                className="bg-white rounded-lg p-4 flex items-start gap-3 hover:bg-red-50 transition-colors"
              >
                <div className="w-8 h-8 bg-red-50 rounded-full flex items-center justify-center text-red-700 flex-shrink-0">➕</div>
                <div>
                  <div className="font-semibold text-sm text-red-700">New Application</div>
                  <div className="text-xs text-red-400 mt-1 font-medium">Higher education courses only</div>
                </div>
              </a>
              <button onClick={() => navigate("/applications")}
                className="bg-white/10 border border-white/20 rounded-lg p-4 flex items-start gap-3 hover:bg-white/20 transition-colors text-left"
              >
                <div className="w-8 h-8 bg-white/15 rounded-full flex items-center justify-center flex-shrink-0">⏳</div>
                <div>
                  <div className="font-semibold text-sm text-white">Action Required</div>
                  <div className="text-xs text-white/60 mt-0.5">{stats.waiting} items require action</div>
                </div>
              </button>
              <button onClick={() => setShowModal(true)}
                className="bg-white/10 border border-white/20 rounded-lg p-4 flex items-start gap-3 hover:bg-white/20 transition-colors text-left"
              >
                <div className="w-8 h-8 bg-white/15 rounded-full flex items-center justify-center flex-shrink-0">✉️</div>
                <div>
                  <div className="font-semibold text-sm text-white">Send a Message</div>
                  <div className="text-xs text-white/60 mt-0.5">Contact our Holmes Teams</div>
                </div>
              </button>
              <button onClick={exportCSV}
                className="bg-white/10 border border-white/20 rounded-lg p-4 flex items-start gap-3 hover:bg-white/20 transition-colors text-left"
              >
                <div className="w-8 h-8 bg-white/15 rounded-full flex items-center justify-center flex-shrink-0">📤</div>
                <div>
                  <div className="font-semibold text-sm text-white">Export to CSV</div>
                  <div className="text-xs text-white/60 mt-0.5">Download student list</div>
                </div>
              </button>
            </div>
          </div>

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
              {loading && [1,2,3,4,5].map(i => <ActivityRowSkeleton key={i} />)}
              {!loading && recent.length === 0 && <p className="p-8 text-center text-gray-400 text-sm">No applications yet.</p>}
              {recent.map(deal => (
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
                            {deal.courseName && <span className="flex items-center gap-1"><GraduationCap className="h-3 w-3" />{deal.courseName}</span>}
                            {deal.campus && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{deal.campus}</span>}
                          </div>
                        </div>
                        <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border flex-shrink-0 ${BC[deal.stageColor] || BC.stone}`}>
                          {deal.stageLabel}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
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

        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <div className="text-center mb-4">
              <div className="h-16 w-16 mx-auto mb-3 rounded-full bg-red-50 border-2 border-red-100 flex items-center justify-center text-red-700 text-2xl font-semibold">
                {initials(user?.fullName)}
              </div>
              <h3 className="font-semibold text-gray-800">{user?.fullName || "Agent"}</h3>
              <p className="text-sm text-gray-500">{user?.companyName || user?.email}</p>
            </div>
            <div className="space-y-2 text-sm border-t border-stone-100 pt-4">
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span className="text-gray-800 font-medium truncate ml-4">{user?.email}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">Need Assistance?</h3>
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${
                isLive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-stone-100 text-stone-500 border-stone-200"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-stone-400"}`} />
                {isLive ? "Live Now" : "Closed"}
              </div>
            </div>
            <div className="space-y-2 text-sm mb-3">
              <div><p className="text-gray-500 text-xs">Phone</p><p className="font-medium text-gray-900">+61 3 9564 1444</p></div>
              <div><p className="text-gray-500 text-gray-900">Email</p><p className="font-medium text-gray-900">admissions@holmes.edu.au</p></div>
            </div>
            <div className="pt-3 border-t border-stone-100">
              <p className="text-xs text-gray-500">Monday – Friday, 9:00 AM – 5:00 PM AEST</p>
              <button onClick={() => setShowModal(true)}
                className="mt-3 w-full py-2 text-xs font-medium text-red-600 hover:text-red-700 border border-red-200 hover:bg-red-50 rounded-lg transition-colors"
              >
                Contact our Holmes Teams →
              </button>
            </div>
          </div>

          <div className="bg-red-50 rounded-xl border border-red-100 p-5">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
              <h3 className="font-semibold text-gray-800 text-sm">Pro Tip</h3>
            </div>
            <p key={tip} className="text-sm text-gray-600 leading-relaxed">{tip}</p>
            <div className="flex gap-1 mt-3">
              {PRO_TIPS.map((_, i) => (
                <div key={i} className={`h-1 rounded-full transition-all duration-500 ${i === tipIdx ? "bg-red-400 w-4" : "bg-red-200 w-1"}`} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-stone-100">
              <h2 className="text-lg font-bold text-gray-800">Need Help?</h2>
              <p className="text-sm text-gray-500 mt-1">You can reach out to other teams at:</p>
            </div>
            <div className="p-4 space-y-2">
              {MARKETERS.map(m => (
                <a key={m.email} href={`mailto:${m.email}`}
                  className="flex items-center gap-3 p-3 rounded-xl border border-stone-100 hover:border-red-200 hover:bg-red-50 transition-colors group"
                >
                  <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-red-700 font-bold text-xs flex-shrink-0">
                    {m.name.split(" ").map(n => n[0]).join("").slice(0,2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-800 group-hover:text-red-700 transition-colors">{m.name}</p>
                    <p className="text-xs text-gray-500">{m.title}</p>
                    <p className="text-xs text-red-600 mt-0.5">{m.email}</p>
                  </div>
                </a>
              ))}
              <div className="border-t border-stone-100 my-2" />
              {TEAMS.map(t => (
                <a key={t.email} href={`mailto:${t.email}`}
                  className="flex items-center gap-3 p-3 rounded-xl border border-stone-100 hover:border-red-200 hover:bg-red-50 transition-colors group"
                >
                  <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 font-bold text-xs flex-shrink-0">
                    {t.name.split(" ").map(n => n[0]).join("").slice(0,2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-800 group-hover:text-red-700 transition-colors">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.description}</p>
                    <p className="text-xs text-red-600 mt-0.5">{t.email}</p>
                  </div>
                </a>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-stone-100">
              <button onClick={() => setShowModal(false)} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
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
