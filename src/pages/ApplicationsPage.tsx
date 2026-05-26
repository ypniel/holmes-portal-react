import React, { useEffect, useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import {
  CheckCircle2, Clock, FileText, GraduationCap, Globe, MapPin,
  Search, ChevronDown, ChevronsUpDown, ChevronUp, Calendar, Check, X, Plus
} from "lucide-react"
import { PageContainer } from "../components/Layout"
import { useAuth } from "../lib/auth"
import { fetchDeals, Deal, PIPELINE_STAGES } from "../lib/hubspot"
import { initials, formatDate, BADGE_CLASSES } from "../lib/utils"

type SortKey = "studentName" | "intake" | "campus" | "stageLabel" | "lastModified"
type SortDir = "asc" | "desc"

export default function ApplicationsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [campusFilter, setCampusFilter] = useState("all")
  const [residencyFilter, setResidencyFilter] = useState("all")
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("lastModified")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [page, setPage] = useState(1)
  const PER_PAGE = 20

  // New Application Modal
  const [showNewApp, setShowNewApp] = useState(false)
  const [newAppForm, setNewAppForm] = useState({ studentName: "", nationality: "", courseName: "", campus: "", intake: "" })

  useEffect(() => {
    fetchDeals(500)
      .then(setDeals)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  const campuses = useMemo(() => [...new Set(deals.map(d => d.campus).filter(Boolean))].sort(), [deals])
  const residencies = useMemo(() => [...new Set(deals.map(d => d.residencyStatus).filter(Boolean))].sort(), [deals])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return deals
      .filter(d => {
        const matchSearch = !q ||
          d.studentName.toLowerCase().includes(q) ||
          d.courseName.toLowerCase().includes(q) ||
          d.nationality.toLowerCase().includes(q) ||
          d.campus.toLowerCase().includes(q) ||
          d.stageLabel.toLowerCase().includes(q) ||
          d.responseStatus.toLowerCase().includes(q) ||
          d.agentCompany.toLowerCase().includes(q) ||
          d.passport.toLowerCase().includes(q)
        const matchStatus = statusFilter === "all" || d.stageLabel === statusFilter
        const matchCampus = campusFilter === "all" || d.campus === campusFilter
        const matchResidency = residencyFilter === "all" || d.residencyStatus === residencyFilter
        return matchSearch && matchStatus && matchCampus && matchResidency
      })
      .sort((a, b) => {
        let av: any = a[sortKey as keyof Deal]
        let bv: any = b[sortKey as keyof Deal]
        if (sortKey === "intake" || sortKey === "lastModified") {
          av = av ? new Date(av).getTime() : 0
          bv = bv ? new Date(bv).getTime() : 0
        } else {
          av = String(av ?? ""); bv = String(bv ?? "")
        }
        if (av < bv) return sortDir === "asc" ? -1 : 1
        if (av > bv) return sortDir === "asc" ? 1 : -1
        return 0
      })
  }, [deals, search, statusFilter, campusFilter, residencyFilter, sortKey, sortDir])

  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const stats = useMemo(() => ({
    total: deals.length,
    docOut: deals.filter(d => d.stageLabel === "Documentation Outstanding").length,
    offers: deals.filter(d => d.stageLabel.includes("Offer")).length,
    coes: deals.filter(d => d.stageLabel === "Application Complete" || d.stageLabel === "Enrolled").length,
  }), [deals])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sd => sd === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("asc") }
    setPage(1)
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronsUpDown className="h-3.5 w-3.5 text-stone-300" />
    return sortDir === "asc"
      ? <ChevronUp className="h-3.5 w-3.5 text-red-600" />
      : <ChevronDown className="h-3.5 w-3.5 text-red-600" />
  }

  if (error) {
    return (
      <PageContainer>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 font-medium">Failed to load applications. Check your HubSpot connection.</p>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer className="min-w-0 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-700">Applications</h1>
            <p className="text-gray-500 mt-1">Manage student applications for {user?.fullName || "Agent"}</p>
          </div>
          <button
            onClick={() => setShowNewApp(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <GraduationCap className="h-4 w-4" />
            New Application
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { icon: <FileText className="h-5 w-5" />, bg: "bg-stone-100 text-stone-600", label: "Total Applications", value: stats.total },
          { icon: <Clock className="h-5 w-5" />, bg: "bg-red-50 text-red-600", label: "Documentation Outstanding", value: stats.docOut },
          { icon: <CheckCircle2 className="h-5 w-5" />, bg: "bg-blue-50 text-blue-600", label: "Offers Issued", value: stats.offers },
          { icon: <Check className="h-5 w-5" />, bg: "bg-emerald-50 text-emerald-600", label: "Enrolled / Complete", value: stats.coes },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-stone-200 rounded-xl p-4 flex items-center gap-4">
            <div className={`p-3 rounded-full ${s.bg}`}>{s.icon}</div>
            <div>
              <p className="text-sm text-stone-500 font-medium">{s.label}</p>
              <p className="text-2xl font-bold text-gray-800">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-t-xl border border-stone-200 border-b-0 p-4">
        <div className="flex flex-col xl:flex-row xl:items-center gap-3">
          <div className="relative flex-1 min-w-0 xl:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search all fields..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-10 pr-4 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterDropdown
              label="Status"
              value={statusFilter}
              options={PIPELINE_STAGES}
              onSelect={v => { setStatusFilter(v); setPage(1) }}
              open={openDropdown === "status"}
              onToggle={() => setOpenDropdown(openDropdown === "status" ? null : "status")}
            />
            <FilterDropdown
              label="Campus"
              value={campusFilter}
              options={campuses}
              onSelect={v => { setCampusFilter(v); setPage(1) }}
              open={openDropdown === "campus"}
              onToggle={() => setOpenDropdown(openDropdown === "campus" ? null : "campus")}
            />
            <FilterDropdown
              label="Residency"
              value={residencyFilter}
              options={residencies}
              onSelect={v => { setResidencyFilter(v); setPage(1) }}
              open={openDropdown === "residency"}
              onToggle={() => setOpenDropdown(openDropdown === "residency" ? null : "residency")}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white border border-stone-200 rounded-b-xl p-12 text-center">
          <p className="animate-pulse text-stone-400 text-sm">Loading applications…</p>
        </div>
      ) : pageRows.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-b-xl p-12 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-stone-100 flex items-center justify-center mb-4">
            <FileText className="h-8 w-8 text-stone-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-1">No applications found</h3>
          <p className="text-gray-500 text-sm">Try adjusting your search or filter criteria.</p>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-b-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/50">
                  {[
                    { key: "studentName" as SortKey, label: "Student Name" },
                    { key: null, label: "Nationality" },
                    { key: null, label: "Residency" },
                    { key: null, label: "Course Name" },
                    { key: "intake" as SortKey, label: "Intake" },
                    { key: "campus" as SortKey, label: "Campus" },
                    { key: "stageLabel" as SortKey, label: "Status" },
                    { key: "lastModified" as SortKey, label: "Last Modified" },
                  ].map((col) => (
                    <th
                      key={col.label}
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
                {pageRows.map(deal => (
                  <tr
                    key={deal.id}
                    onClick={() => navigate(`/applications/${deal.id}`)}
                    className="hover:bg-red-50/30 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium text-slate-700">
                          {initials(deal.studentName)}
                        </div>
                        <span className="font-medium text-gray-700 group-hover:text-red-600 transition-colors">
                          {deal.studentName}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-stone-600 flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-stone-400" />
                        {deal.nationality || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {deal.residencyStatus ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-stone-100 text-stone-700 border-stone-200">
                          {deal.residencyStatus}
                        </span>
                      ) : <span className="text-stone-400">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-stone-600 max-w-[200px] truncate" title={deal.courseName}>
                      {deal.courseName || "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-stone-600 flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-stone-400" />
                        {deal.intake || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-stone-600 flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-stone-400" />
                        {deal.campus || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${BADGE_CLASSES[deal.stageColor] || BADGE_CLASSES.stone}`}>
                        {deal.stageLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-stone-500">
                      {formatDate(deal.lastModified)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="border-t border-stone-200 px-4 py-3 flex items-center justify-between bg-stone-50/50">
            <span className="text-sm text-stone-500">
              Showing {((page-1)*PER_PAGE)+1}–{Math.min(page*PER_PAGE, filtered.length)} of {filtered.length} applications
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p-1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-stone-200 rounded-lg disabled:opacity-40 hover:bg-stone-100 transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-stone-500">{page} / {totalPages || 1}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p+1))}
                disabled={page >= totalPages}
                className="px-3 py-1 text-sm border border-stone-200 rounded-lg disabled:opacity-40 hover:bg-stone-100 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Application Modal */}
      {showNewApp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNewApp(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-stone-200">
              <h2 className="text-lg font-semibold text-gray-800">New Application</h2>
              <button onClick={() => setShowNewApp(false)} className="text-stone-400 hover:text-stone-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {[
                { label: "Student Name *", key: "studentName", placeholder: "Enter student name" },
                { label: "Nationality", key: "nationality", placeholder: "Enter nationality" },
                { label: "Course Name", key: "courseName", placeholder: "Enter course name" },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                  <input
                    type="text"
                    value={(newAppForm as any)[f.key]}
                    onChange={e => setNewAppForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder={f.placeholder}
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Campus</label>
                  <select
                    value={newAppForm.campus}
                    onChange={e => setNewAppForm(prev => ({ ...prev, campus: e.target.value }))}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="">Select campus</option>
                    {campuses.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Intake Date</label>
                  <input
                    type="text"
                    value={newAppForm.intake}
                    onChange={e => setNewAppForm(prev => ({ ...prev, intake: e.target.value }))}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="e.g. March 2026"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-stone-200">
              <button onClick={() => setShowNewApp(false)} className="px-4 py-2 border border-stone-200 rounded-lg text-sm hover:bg-stone-50">Cancel</button>
              <button
                disabled={!newAppForm.studentName.trim()}
                className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-sm disabled:opacity-50 transition-colors"
                onClick={() => {
                  // In production: create deal via HubSpot API
                  alert("New application submitted! In production this creates a HubSpot deal.")
                  setShowNewApp(false)
                }}
              >
                Create Application
              </button>
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
      <button
        type="button"
        onClick={onToggle}
        className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors min-w-[120px] justify-between ${
          active ? "border-red-300 bg-red-50 text-red-700" : "border-stone-200 text-stone-600 hover:bg-stone-50"
        }`}
      >
        <span className="truncate">{active ? value : label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg z-20 py-1 w-56 max-h-64 overflow-y-auto">
          <button
            type="button"
            onClick={() => onSelect("all")}
            className={`w-full text-left px-4 py-2 text-sm hover:bg-stone-50 ${value === "all" || value === "" ? "text-red-700 font-medium bg-red-50" : "text-stone-700"}`}
          >
            All
          </button>
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => onSelect(opt)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-stone-50 ${value === opt ? "text-red-700 font-medium bg-red-50" : "text-stone-700"}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
