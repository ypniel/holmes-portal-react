import React, { useEffect, useState, useMemo } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import {
  CheckCircle2, Clock, FileText, GraduationCap, Globe, MapPin,
  Search, ChevronDown, ChevronsUpDown, ChevronUp, Calendar, Download
} from "lucide-react"
import { PageContainer } from "../components/Layout"
import { fetchDeals, Deal } from "../lib/hubspot"
import { initials, formatDate, formatIntake, BADGE_CLASSES as BC } from "../lib/utils"
import { useAuth, isHolmesStaff } from "../lib/auth"

type SortKey = "studentName" | "intake" | "campus" | "stageLabel" | "lastModified"
type SortDir  = "asc" | "desc"

// ── Demo mode: hardcoded deal IDs for boss demo ──────────────────────────────
const DEMO_IDS = new Set([
  "60381128785","60381128784","60380825611","60378197016","60377570929",
  "60377428743","60377260695","60370916106","60403561910","60403249337",
  "60402480141","60402016566","60400476795","60398921390","60392126252",
  "60391661937","60389422710","60387874402","60387095405","60386786364",
  "60385406373","60384232607","60383764014","60382524535","60381287187",
  "60380522790","60377570930","60377428742","60403734325","60401408118",
  "60399387941","60384232608","60382842773","60382227022","60381756777",
  "60381605513","60380216396","60377889444","60376963612","60399086164",
  "60398614292","60387728242","60385406374","60385257345","60383618881",
  "60383453468","60381605512","60381434740","60380825613","60378197015",
  "60370916105","60404652885","60400331804","60400014508","60400014507",
  "60398306967","60392752262","60392443761","60392126251","60391204532",
  "60388974630","60388656175","60388341116","60384473904","60384081585",
  "60382078108","60381756776","60379437606","60377734533","60371377249",
  "60400779899","60400159393","60399552286","60392286903","60390208859",
  "60382380355","60378197014","60378197013","60378041524","60404493625",
  "60401408117","60399552285","60391520301","60390208858","60387574612",
  "60384473903","60382380354","60379584144","60378814034","60378041523",
  "60371998843","60371843958","60400331808","60391969076","60390208857",
  "60388974629","60387728241","60387728240","60385868040","60385406372",
])
const IS_DEMO = true // flip to false after boss demo

const NEW_APP_URL = "https://share.hsforms.com/295xCp21qRwiF7dm8byV6SQnrkx6"

export default function ApplicationsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Pre-fill search from URL param (e.g. from header search)
  const urlSearch = new URLSearchParams(location.search).get("search") || ""
  const [search, setSearch] = useState(urlSearch)
  const [statusFilter, setStatusFilter]     = useState("all")
  const [campusFilter, setCampusFilter]     = useState("all")
  const [responseFilter, setResponseFilter] = useState("all")
  const [nationalityFilter, setNationalityFilter] = useState("all")
  const [residencyFilter, setResidencyFilter]     = useState("all")
  const [courseFilter, setCourseFilter]           = useState("all")
  const [intakeFilter, setIntakeFilter]           = useState("all")
  const [openDropdown, setOpenDropdown]   = useState<string | null>(null)
  const [sortKey, setSortKey]   = useState<SortKey>("lastModified")
  const [sortDir, setSortDir]   = useState<SortDir>("desc")
  const [page, setPage]         = useState(1)
  const PER_PAGE = 10

  const { user } = useAuth()

  useEffect(() => {
    fetchDeals(5000).then(d => {
      let result = IS_DEMO ? d.filter(deal => DEMO_IDS.has(deal.id)) : d
      // Agents only see their own deals — Holmes staff see everything
      if (user?.email && !isHolmesStaff(user.email)) {
        result = result.filter(deal =>
          deal.agentEmail?.toLowerCase() === user.email.toLowerCase()
        )
      }
      setDeals(result)
    }).catch(() => setError(true)).finally(() => setLoading(false))
  }, [user])

  const campuses     = useMemo(() => [...new Set(deals.map(d => d.campus).filter(Boolean))].sort(), [deals])
  const stages       = useMemo(() => [...new Set(deals.map(d => d.stageLabel).filter(Boolean))].sort(), [deals])
  const nationalities = useMemo(() => [...new Set(deals.map(d => d.nationality).filter(Boolean))].sort(), [deals])
  const residencies  = useMemo(() => [...new Set(deals.map(d => d.residencyStatus).filter(Boolean))].sort(), [deals])
  const courses      = useMemo(() => [...new Set(deals.map(d => d.courseName).filter(Boolean))].sort(), [deals])
  const intakes      = useMemo(() => [...new Set(deals.map(d => d.intake).filter(Boolean))].sort(), [deals])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return deals.filter(d => {
      const ms = !q ||
        d.studentName.toLowerCase().includes(q) ||
        d.courseName.toLowerCase().includes(q) ||
        d.nationality.toLowerCase().includes(q) ||
        d.campus.toLowerCase().includes(q) ||
        d.stageLabel.toLowerCase().includes(q) ||
        d.responseStatus.toLowerCase().includes(q) ||
        d.agentCompany.toLowerCase().includes(q) ||
        d.passport.toLowerCase().includes(q) ||
        d.studentId.toLowerCase().includes(q) ||
        d.dealId.toLowerCase().includes(q)
      const mst = statusFilter === "all"      || d.stageLabel === statusFilter
      const mc  = campusFilter === "all"       || d.campus === campusFilter
      const mr  = responseFilter === "all"     || d.responseStatus === responseFilter
      const mn  = nationalityFilter === "all"  || d.nationality === nationalityFilter
      const mre = residencyFilter === "all"    || d.residencyStatus === residencyFilter
      const mco = courseFilter === "all"       || d.courseName === courseFilter
      const mi  = intakeFilter === "all"       || d.intake === intakeFilter
      return ms && mst && mc && mr && mn && mre && mco && mi
    }).sort((a, b) => {
      let av: any = a[sortKey as keyof Deal]
      let bv: any = b[sortKey as keyof Deal]
      if (sortKey === "intake" || sortKey === "lastModified") {
        av = av ? new Date(av).getTime() : 0
        bv = bv ? new Date(bv).getTime() : 0
      } else { av = String(av ?? ""); bv = String(bv ?? "") }
      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      return 0
    })
  }, [deals, search, statusFilter, campusFilter, responseFilter, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const pageRows   = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const stats = useMemo(() => ({
    total:   deals.length,
    waiting: deals.filter(d => d.responseStatus.toLowerCase().includes("waiting")).length,
    offers:  deals.filter(d => d.stageLabel.includes("Offer")).length,
    coes:    deals.filter(d => ["Application Completed","Enrolled"].includes(d.stageLabel)).length,
    conversionRate: deals.length > 0
      ? Math.round((deals.filter(d => ["Application Completed","Enrolled"].includes(d.stageLabel)).length / deals.length) * 100)
      : 0,
  }), [deals])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sd => sd === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("asc") }
    setPage(1)
  }

  // ── XLSX export ─────────────────────────────────────────────────────────────
  function exportXLSX() {
    const rows = [
      ["Student Name","Nationality","Residency","Course Name","Intake","Campus","Response Status","Case Status","Last Modified"],
      ...filtered.map(d => [
        d.studentName, d.nationality, d.residencyStatus, d.courseName,
        d.intake, d.campus, d.responseStatus, d.stageLabel, formatDate(d.lastModified)
      ])
    ]
    const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url; a.download = "Holmes_Applications.csv"; a.click()
    URL.revokeObjectURL(url)
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronsUpDown className="h-3.5 w-3.5 text-stone-300" />
    return sortDir === "asc" ? <ChevronUp className="h-3.5 w-3.5 text-red-600" /> : <ChevronDown className="h-3.5 w-3.5 text-red-600" />
  }

  if (error) return <PageContainer><div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center"><p className="text-red-700">Failed to load. Check your HubSpot connection.</p></div></PageContainer>

  return (
    <PageContainer className="min-w-0 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-700">Applications</h1>
            <p className="text-gray-500 mt-1">Australia Admissions Pipeline</p>
          </div>
          <div className="flex gap-2">
            {/* Export button */}
            <button onClick={exportXLSX}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 hover:bg-stone-50 text-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              <Download className="h-4 w-4" />Export CSV
            </button>
            {/* New Application → HubSpot form */}
            <a href={NEW_APP_URL} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <GraduationCap className="h-4 w-4" />New Application
            </a>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? [1,2,3,4].map(i => <StatCardSkeleton key={i} />) : (
          <>
            {[
              { icon: <FileText className="h-5 w-5 text-stone-600" />,       bg: "bg-stone-100",   label: "Total Applications", value: stats.total },
              { icon: <Clock className="h-5 w-5 text-amber-600" />,          bg: "bg-amber-50",    label: "Action Required",    value: stats.waiting },
              { icon: <CheckCircle2 className="h-5 w-5 text-blue-600" />,    bg: "bg-blue-50",     label: "Offers Issued",      value: stats.offers },
              { icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />, bg: "bg-emerald-50",  label: "COE Issued",         value: stats.coes },
            ].map((s, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-xl p-4 flex items-center gap-4">
                <div className={`p-3 rounded-full ${s.bg}`}>{s.icon}</div>
                <div>
                  <p className="text-xs text-stone-500 font-medium leading-tight">{s.label}</p>
                  <p className="text-2xl font-bold text-gray-800">{s.value}</p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Conversion Rate */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 mb-6 flex items-center gap-6">
        <div className="flex-shrink-0">
          <p className="text-xs text-stone-500 font-medium uppercase tracking-wider">Conversion Rate</p>
          <p className="text-2xl font-bold text-gray-800">{stats.conversionRate}%</p>
          <p className="text-xs text-stone-400">COE Issued ÷ Total Applications</p>
        </div>
        <div className="flex-1">
          <div className="w-full bg-stone-100 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-red-500 to-emerald-500 h-3 rounded-full transition-all duration-700"
              style={{ width: `${stats.conversionRate}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-stone-400 mt-1">
            <span>0%</span>
            <span>{stats.coes} COEs from {stats.total} applications</span>
            <span>100%</span>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-t-xl border border-stone-200 border-b-0 p-4">
        <div className="flex flex-col xl:flex-row xl:items-center gap-3">
          <div className="relative flex-1 min-w-0 xl:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
            <input type="text" placeholder="Search by name, deal ID, passport, nationality…" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-10 pr-4 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterDropdown label="Case Status"      value={statusFilter}      options={stages}       onSelect={v => { setStatusFilter(v);      setPage(1) }} open={openDropdown==="status"}      onToggle={() => setOpenDropdown(openDropdown==="status"      ? null : "status")} />
            <FilterDropdown label="Campus"           value={campusFilter}      options={campuses}     onSelect={v => { setCampusFilter(v);      setPage(1) }} open={openDropdown==="campus"}      onToggle={() => setOpenDropdown(openDropdown==="campus"      ? null : "campus")} />
            <FilterDropdown label="Response Status"  value={responseFilter}    options={["Holmes Received","Waiting on Agent"]} onSelect={v => { setResponseFilter(v); setPage(1) }} open={openDropdown==="response"} onToggle={() => setOpenDropdown(openDropdown==="response" ? null : "response")} />
            <FilterDropdown label="Nationality"      value={nationalityFilter} options={nationalities} onSelect={v => { setNationalityFilter(v); setPage(1) }} open={openDropdown==="nationality"} onToggle={() => setOpenDropdown(openDropdown==="nationality" ? null : "nationality")} />
            <FilterDropdown label="Residency"        value={residencyFilter}   options={residencies}  onSelect={v => { setResidencyFilter(v);   setPage(1) }} open={openDropdown==="residency"}   onToggle={() => setOpenDropdown(openDropdown==="residency"   ? null : "residency")} />
            <FilterDropdown label="Course"           value={courseFilter}      options={courses}      onSelect={v => { setCourseFilter(v);      setPage(1) }} open={openDropdown==="course"}      onToggle={() => setOpenDropdown(openDropdown==="course"      ? null : "course")} />
            <FilterDropdown label="Intake"           value={intakeFilter}      options={intakes}      onSelect={v => { setIntakeFilter(v);      setPage(1) }} open={openDropdown==="intake"}      onToggle={() => setOpenDropdown(openDropdown==="intake"      ? null : "intake")} />
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white border border-stone-200 rounded-b-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <tbody>
                {[1,2,3,4,5,6,7,8,9,10].map(i => <TableRowSkeleton key={i} />)}
              </tbody>
            </table>
          </div>
        </div>
      ) : pageRows.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-b-xl p-12 text-center">
          <FileText className="h-8 w-8 text-stone-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-700">No applications found</h3>
          <p className="text-gray-500 text-sm">Try adjusting your filters.</p>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-b-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/50">
                  {[
                    { key: "studentName" as SortKey, label: "Student Name" },
                    { key: null, label: "Deal ID" },
                    { key: null, label: "Passport" },
                    { key: null, label: "Nationality" },
                    { key: null, label: "Residency" },
                    { key: null, label: "Course Name" },
                    { key: "intake" as SortKey, label: "Intake" },
                    { key: "campus" as SortKey, label: "Campus" },
                    { key: null, label: "Response Status" },
                    { key: "stageLabel" as SortKey, label: "Case Status" },
                    { key: "lastModified" as SortKey, label: "Last Modified" },
                  ].map(col => (
                    <th key={col.label}
                      className={`text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wider ${col.key ? "cursor-pointer select-none hover:text-gray-700" : ""}`}
                      onClick={() => col.key && handleSort(col.key)}
                    >
                      <span className="flex items-center gap-1.5">
                        {col.label}
                        {col.key && <SortIcon k={col.key} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {pageRows.map(deal => {
                  const respColor = deal.responseStatus.toLowerCase().includes("holmes")
                    ? "bg-red-50 text-red-700 border-red-200"
                    : deal.responseStatus.toLowerCase().includes("waiting")
                    ? "bg-green-50 text-green-700 border-green-200"
                    : "bg-stone-100 text-stone-600 border-stone-200"

                  return (
                    <tr key={deal.id} onClick={() => navigate(`/applications/${deal.id}`)}
                      className="hover:bg-red-50/30 transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium text-slate-700 flex-shrink-0">
                            {initials(deal.studentName)}
                          </div>
                          <span className="font-medium text-gray-700 group-hover:text-red-600 transition-colors">{deal.studentName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-stone-500 bg-stone-50 px-2 py-0.5 rounded">{deal.dealId}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-stone-600">{deal.passport || "—"}</span>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-stone-600">
                        <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-stone-400" />{deal.nationality || "—"}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        {deal.residencyStatus
                          ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-stone-100 text-stone-700 border-stone-200">{deal.residencyStatus}</span>
                          : <span className="text-stone-400">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-stone-600 max-w-[200px] truncate" title={deal.courseName}>{deal.courseName || "—"}</td>
                      <td className="px-4 py-3.5 text-sm text-stone-600">
                        <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-stone-400" />{formatIntake(deal.intake)}</span>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-stone-600">
                        <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-stone-400" />{deal.campus || "—"}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        {deal.responseStatus
                          ? <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${respColor}`}>{deal.responseStatus}</span>
                          : <span className="text-stone-400">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${BC[deal.stageColor] || BC.stone}`}>
                          {deal.stageLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-stone-500">{formatDate(deal.lastModified)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="border-t border-stone-200 px-4 py-3 flex items-center justify-between bg-stone-50/50">
            <span className="text-sm text-stone-500">
              Showing {Math.min((page-1)*PER_PAGE+1, filtered.length)}–{Math.min(page*PER_PAGE, filtered.length)} of {filtered.length} applications
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                className="px-3 py-1 text-sm border border-stone-200 rounded-lg disabled:opacity-40 hover:bg-stone-100 transition-colors"
              >Previous</button>
              <span className="text-sm text-stone-500">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page>=totalPages}
                className="px-3 py-1 text-sm border border-stone-200 rounded-lg disabled:opacity-40 hover:bg-stone-100 transition-colors"
              >Next</button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

function FilterDropdown({ label, value, options, onSelect, open, onToggle }: {
  label: string; value: string; options: string[]
  onSelect: (v: string) => void; open: boolean; onToggle: () => void
}) {
  const active = value !== "all" && value !== ""
  return (
    <div className="relative">
      <button type="button" onClick={onToggle}
        className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors min-w-[130px] justify-between ${
          active ? "border-red-300 bg-red-50 text-red-700" : "border-stone-200 text-stone-600 hover:bg-stone-50"
        }`}
      >
        <span className="truncate">{active ? value : label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg z-20 py-1 w-56 max-h-64 overflow-y-auto">
          <button type="button" onClick={() => onSelect("all")}
            className={`w-full text-left px-4 py-2 text-sm hover:bg-stone-50 ${value==="all"||value===""?"text-red-700 font-medium bg-red-50":"text-stone-700"}`}
          >All</button>
          {options.map(opt => (
            <button key={opt} type="button" onClick={() => onSelect(opt)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-stone-50 ${value===opt?"text-red-700 font-medium bg-red-50":"text-stone-700"}`}
            >{opt}</button>
          ))}
        </div>
      )}
    </div>
  )
}
