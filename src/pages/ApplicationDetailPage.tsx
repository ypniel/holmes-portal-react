import React, { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft, FileText, GraduationCap, User, Building2,
  MessageSquare, Send, Paperclip, Dot, Download, ExternalLink
} from "lucide-react"
import { PageContainer } from "../components/Layout"
import {
  fetchDeal, fetchNotes, fetchOwners, fetchFiles, fetchDealCompany,
  createNote, Deal, Note, FileItem, Company
} from "../lib/hubspot"
import { formatDate, formatDateTime, formatIntake, BADGE_CLASSES as BC, initials } from "../lib/utils"

type Tab = "course" | "student" | "agent" | "chatter" | "documents"

export default function ApplicationDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [deal, setDeal] = useState<Deal | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [owners, setOwners] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<FileItem[]>([])
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>("course")
  const [comment, setComment] = useState("")
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      fetchDeal(id),
      fetchNotes(id),
      fetchOwners(),
      fetchFiles(id),
      fetchDealCompany(id),
    ]).then(([d, n, o, f, c]) => {
      setDeal(d); setNotes(n); setOwners(o); setFiles(f); setCompany(c)
    }).finally(() => setLoading(false))
  }, [id])

  const handlePostComment = async () => {
    if (!comment.trim() || !id) return
    setSending(true)
    const ok = await createNote(id, comment.trim())
    if (ok) {
      setComment("")
      const updated = await fetchNotes(id)
      setNotes(updated)
    }
    setSending(false)
  }

  if (loading) return <PageContainer><p className="animate-pulse text-gray-400 text-sm py-16 text-center">Loading application…</p></PageContainer>
  if (!deal) return <PageContainer><p className="text-gray-400 text-sm py-16 text-center">Application not found.</p></PageContainer>

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "course",    label: "Course Information", icon: GraduationCap },
    { id: "student",   label: "Student Details",    icon: User },
    { id: "agent",     label: "Agent Details",      icon: Building2 },
    { id: "chatter",   label: "Messages",           icon: MessageSquare },
    { id: "documents", label: "Documents",          icon: Paperclip },
  ]
  const ActiveIcon = tabs.find(t => t.id === activeTab)?.icon || FileText

  return (
    <PageContainer className="min-w-0 max-w-full overflow-x-hidden">
      {/* Back */}
      <button
        onClick={() => navigate("/applications")}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors mb-6 group"
      >
        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
        Back to Applications
      </button>

      {/* ── Beautiful gradient top card ── */}
      <div className="relative rounded-xl overflow-hidden mb-6 shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-br from-red-800 via-red-700 to-red-900" />
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "60px 60px" }}
        />
        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur border-2 border-white/30 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                  {initials(deal.studentName)}
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white leading-tight">{deal.studentName}</h1>
                  {/* Passport + DOB instead of course name */}
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {deal.passport && (
                      <span className="inline-flex items-center gap-1.5 bg-white/15 text-white/90 text-xs px-2.5 py-1 rounded-full border border-white/20">
                        <span className="text-white/50 text-[10px] uppercase tracking-widest">Passport</span>
                        <span className="font-medium">{deal.passport}</span>
                      </span>
                    )}
                    {deal.dob && (
                      <span className="inline-flex items-center gap-1.5 bg-white/15 text-white/90 text-xs px-2.5 py-1 rounded-full border border-white/20">
                        <span className="text-white/50 text-[10px] uppercase tracking-widest">DOB</span>
                        <span className="font-medium">{formatDate(deal.dob)}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* Stage badge */}
              <div className="mb-4">
                <span className="inline-flex items-center gap-2 bg-white/15 backdrop-blur border border-white/25 text-white px-4 py-1.5 rounded-full text-sm font-semibold">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  {deal.stageLabel}
                </span>
              </div>
              {/* ID pills */}
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 bg-white/10 text-white px-3 py-1.5 rounded-full border border-white/20 font-medium">
                  <span className="text-white/50 text-[10px] uppercase tracking-widest">Deal</span>
                  <span>{deal.dealId}</span>
                </span>
                {deal.studentId && (
                  <span className="inline-flex items-center gap-1.5 bg-white/10 text-white px-3 py-1.5 rounded-full border border-white/20 font-medium">
                    <span className="text-white/50 text-[10px] uppercase tracking-widest">Student ID</span>
                    <span>{deal.studentId}</span>
                  </span>
                )}
                {deal.jupiterId && (
                  <span className="inline-flex items-center gap-1.5 bg-white/10 text-white px-3 py-1.5 rounded-full border border-white/20 font-medium">
                    <span className="text-white/50 text-[10px] uppercase tracking-widest">Jupiter Legacy System ID</span>
                    <span>{deal.jupiterId}</span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:text-right flex-shrink-0">
              {deal.campus && (
                <div className="bg-white/10 backdrop-blur border border-white/20 rounded-lg px-4 py-2">
                  <p className="text-red-200 text-xs uppercase tracking-wider">Campus</p>
                  <p className="text-white font-semibold">{deal.campus}</p>
                </div>
              )}
              {deal.intake && (
                <div className="bg-white/10 backdrop-blur border border-white/20 rounded-lg px-4 py-2">
                  <p className="text-red-200 text-xs uppercase tracking-wider">Intake</p>
                  <p className="text-white font-semibold">{formatIntake(deal.intake)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6 min-w-0">
        {/* Main Left */}
        <div className="lg:col-span-8 space-y-6">
          {/* Tabs */}
          <div className="bg-white rounded-xl border border-stone-200 p-1 flex overflow-x-auto gap-1">
            {tabs.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.id ? "bg-red-50 text-red-700" : "text-gray-600 hover:bg-stone-50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  {tab.id === "documents" && files.length > 0 && (
                    <span className="ml-1 bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded-full font-semibold">{files.length}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden min-h-[400px]">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center gap-2 bg-stone-50/30">
              <ActiveIcon className="h-5 w-5 text-red-600" />
              <h2 className="font-semibold text-gray-700 text-lg">{tabs.find(t => t.id === activeTab)?.label}</h2>
            </div>
            <div className="p-6">

              {/* ── Course ── */}
              {activeTab === "course" && (
                <div className="grid md:grid-cols-2 gap-x-8">
                  <DetailRow label="Course Name"       value={deal.courseName} />
                  <DetailRow label="Campus"            value={deal.campus} />
                  <DetailRow label="Intake"            value={formatIntake(deal.intake)} />
                  <DetailRow label="Start Date"        value={formatDate(deal.courseStart)} />
                  <DetailRow label="End Date"          value={formatDate(deal.courseEnd)} />
                  <DetailRow label="OSHC"              value={deal.oshc} />
                  <DetailRow label="EAP"               value={deal.eap} />
                  <DetailRow label="Advanced Standing" value={deal.advancedStanding} />
                  <DetailRow label="English Test Type" value={deal.englishTestType} />
                  <DetailRow label="English Score"     value={deal.englishScore} />
                  <DetailRow label="Tuition Fees"      value={deal.tuitionFees} />
                  <DetailRow label="Scholarship"       value={deal.scholarship} />
                  <DetailRow label="Total Cost"        value={deal.totalCost} />
                  <DetailRow label="Last Modified"     value={formatDateTime(deal.lastModified)} />
                </div>
              )}

              {/* ── Student ── */}
              {activeTab === "student" && (
                <div className="grid md:grid-cols-2 gap-x-8">
                  <DetailRow label="Student Name"     value={deal.studentName} />
                  <DetailRow label="Nationality"      value={deal.nationality} />
                  <DetailRow label="Residency Status" value={deal.residencyStatus} />
                  <DetailRow label="Date of Birth"    value={formatDate(deal.dob)} />
                  <DetailRow label="Passport Number"  value={deal.passport} />
                  <DetailRow label="Student ID"       value={deal.studentId} />
                  <DetailRow label="Jupiter ID"       value={deal.jupiterId} />
                  <DetailRow label="Deal ID"          value={deal.dealId} />
                </div>
              )}

              {/* ── Agent (from Companies) ── */}
              {activeTab === "agent" && (
                <div className="grid md:grid-cols-2 gap-x-8">
                  {company ? (
                    <>
                      <DetailRow label="Company Name"   value={company.name} />
                      <DetailRow label="Phone"          value={company.phone} />
                      <DetailRow label="Email"          value={company.email} />
                      <DetailRow label="City"           value={company.city} />
                      <DetailRow label="Country"        value={company.country} />
                      <DetailRow label="Address"        value={company.address} />
                      {company.website && (
                        <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 py-3 border-b border-stone-100">
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider sm:w-1/3">Website</span>
                          <a href={company.website} target="_blank" rel="noopener noreferrer"
                            className="text-sm text-red-600 hover:underline flex items-center gap-1">
                            {company.website} <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <DetailRow label="Agent Company" value={deal.agentCompany} />
                      <DetailRow label="Branch Office" value={deal.branchOffice} />
                      <div className="col-span-2 mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                        <p className="text-xs text-amber-700">No company record linked to this deal in HubSpot.</p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Chatter ── */}
              {activeTab === "chatter" && (
                <div className="flex flex-col h-[500px]">
                  {/* Messages list */}
                  <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
                    {notes.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center py-8">
                        <div className="w-14 h-14 bg-stone-100 rounded-full flex items-center justify-center mb-3">
                          <MessageSquare className="h-6 w-6 text-stone-400" />
                        </div>
                        <p className="text-sm font-medium text-gray-600">No messages yet</p>
                        <p className="text-xs text-gray-400 mt-1">Send a message below to start the conversation</p>
                      </div>
                    ) : notes.map(note => {
                      let body = note.body
                      let author = owners[note.ownerId] || "HubSpot User"
                      const isPortal = body.startsWith("[Portal Comment —")
                      if (isPortal) {
                        try {
                          author = body.split("—")[1].split("]")[0].trim()
                          body = body.split("]\n\n")[1] || body
                        } catch {}
                      }
                      const authorInitials = initials(author)
                      return (
                        <div key={note.id} className="flex gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${isPortal ? "bg-red-100 text-red-700" : "bg-stone-100 text-stone-600"}`}>
                            {authorInitials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold text-gray-800">{author}</span>
                              <span className="text-xs text-gray-400">{formatDateTime(note.createdAt)}</span>
                              {isPortal && <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-medium">Portal</span>}
                            </div>
                            <div className="bg-stone-50 rounded-xl rounded-tl-none px-4 py-3 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap border border-stone-100">
                              {body}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Message input */}
                  <div className="border-t border-stone-100 pt-4">
                    <div className="bg-stone-50 rounded-xl border border-stone-200 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-100 transition-all">
                      <textarea
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handlePostComment() }}
                        placeholder="Write a message... (Ctrl+Enter to send)"
                        rows={3}
                        className="w-full px-4 py-3 text-sm bg-transparent focus:outline-none resize-none text-gray-700 placeholder-stone-400"
                      />
                      <div className="flex items-center justify-between px-4 pb-3">
                        <span className="text-xs text-stone-400">Saves directly to HubSpot</span>
                        <button
                          onClick={handlePostComment}
                          disabled={!comment.trim() || sending}
                          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg disabled:opacity-50 transition-colors font-medium shadow-sm"
                        >
                          <Send className="h-3.5 w-3.5" />
                          {sending ? "Sending…" : "Send"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Documents ── */}
              {activeTab === "documents" && (
                <div>
                  {/* Upload area */}
                  <DocumentUploader dealId={deal.id} onUploaded={() => {
                    fetchFiles(deal.id).then(setFiles)
                  }} />

                  <div className="mt-4">
                    {files.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Paperclip className="h-8 w-8 text-stone-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">No documents attached yet.</p>
                        <p className="text-xs text-gray-400 mt-1">Drag and drop files above or upload through HubSpot.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {files.map((f, i) => {
                          const ext = (f.name && f.name !== "Unknown" && f.name !== "Document")
                            ? f.name.split(".").pop()?.toUpperCase() || "FILE" : "FILE"
                          const displayName = (f.name && f.name !== "Unknown") ? f.name : `Document ${i + 1}`
                          const dateStr = f.createdAt ? formatDateTime(new Date(f.createdAt).toISOString()) : "—"
                          const extColors: Record<string, string> = {
                            PDF: "bg-red-50 text-red-600", DOC: "bg-blue-50 text-blue-600",
                            DOCX: "bg-blue-50 text-blue-600", JPG: "bg-green-50 text-green-600",
                            JPEG: "bg-green-50 text-green-600", PNG: "bg-green-50 text-green-600",
                            XLSX: "bg-emerald-50 text-emerald-600", XLS: "bg-emerald-50 text-emerald-600",
                          }
                          const extColor = extColors[ext] || "bg-stone-100 text-stone-600"
                          return (
                            <div key={f.id || i} className="flex items-center gap-3 p-3 rounded-xl border border-stone-100 bg-stone-50/50 hover:bg-stone-100/50 transition-colors group">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${extColor}`}>{ext}</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{displayName}</p>
                                <p className="text-xs text-gray-400">{dateStr}</p>
                              </div>
                              {f.url && (
                                <a href={f.url} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-xs font-medium text-gray-600 hover:text-red-600 hover:border-red-200 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <Download className="h-3 w-3" />Download
                                </a>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="lg:col-span-4 space-y-4">
          {/* Key Dates */}
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <div className="font-semibold text-gray-700 text-sm mb-3 flex items-center gap-2">📅 Key Dates</div>
            <div className="space-y-3 text-sm">
              <SidebarRow label="Date Added"    value={formatDate(deal.createdAt)} />
              <SidebarRow label="Last Modified" value={formatDate(deal.lastModified)} />
              <SidebarRow label="Course Start"  value={formatDate(deal.courseStart)} />
              <SidebarRow label="Course End"    value={formatDate(deal.courseEnd)} />
            </div>
          </div>

          {/* Need Assistance */}
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800 text-sm">Need Assistance?</h3>
              <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                <Dot className="h-3 w-3 fill-current animate-pulse" />
                <span className="text-xs font-semibold">Live Now</span>
              </div>
            </div>
            <div className="space-y-2 text-sm mb-3">
              <div><p className="text-xs text-gray-500">Phone</p><p className="font-medium text-gray-900">+61 3 9564 1444</p></div>
              <div><p className="text-xs text-gray-500">Email</p><p className="font-medium text-gray-900">admissions@holmes.edu.au</p></div>
            </div>
            <div className="pt-3 border-t border-stone-100">
              <p className="text-xs text-gray-500 font-medium mb-0.5">Available Hours</p>
              <p className="text-xs text-gray-700">Monday – Friday, 9:00 AM – 5:00 PM AEST</p>
            </div>
          </div>

          {/* Pro Tip — rotating */}
          <RotatingProTip />
        </div>
      </div>
    </PageContainer>
  )
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 py-3 border-b border-stone-100 last:border-0">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider sm:w-1/3">{label}</span>
      <span className="text-sm text-gray-800">{value || "—"}</span>
    </div>
  )
}

function SidebarRow({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="font-medium text-gray-800">{value || "—"}</p>
    </div>
  )
}

const PRO_TIPS = [
  "Keep student documents up to date to ensure faster processing times for visa applications.",
  "Submit IELTS or English test results early — verification delays are the most common cause of offer letter hold-ups.",
  "Double-check passport expiry dates before submitting — passports must be valid for at least 6 months beyond the course end date.",
  "Ensure the student's name on all documents exactly matches the passport. Discrepancies cause significant delays.",
  "OSHC must be arranged before the COE can be issued. Remind students to arrange health cover early.",
  "Advanced Standing applications take longer to assess — submit these cases as early as possible before intake.",
  "For onshore students, make sure their current visa allows them to study before submitting an application.",
]

function RotatingProTip() {
  const [idx, setIdx] = React.useState(0)
  React.useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % PRO_TIPS.length), 8000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="bg-red-50 rounded-xl border border-red-100 p-5">
      <h3 className="font-semibold text-gray-800 text-sm mb-2 flex items-center gap-2">
        <span className="text-red-600">✓</span> Pro Tip
      </h3>
      <p key={idx} className="text-sm text-gray-600 leading-relaxed">{PRO_TIPS[idx]}</p>
      <div className="flex gap-1 mt-3">
        {PRO_TIPS.map((_, i) => (
          <div key={i} className={`h-1 rounded-full transition-all duration-500 ${i === idx ? "bg-red-400 w-4" : "bg-red-200 w-1"}`} />
        ))}
      </div>
    </div>
  )
}

function DocumentUploader({ dealId, onUploaded }: { dealId: string; onUploaded: () => void }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadMsg(null)
    try {
      for (const file of Array.from(files)) {
        // Upload to HubSpot Files API via proxy
        const formData = new FormData()
        formData.append("file", file)
        formData.append("folderPath", "/portal-uploads")
        formData.append("options", JSON.stringify({ access: "PRIVATE", overwrite: false }))

        const res = await fetch(`/.netlify/functions/upload?dealId=${dealId}`, {
          method: "POST",
          body: formData,
        })
        if (!res.ok) throw new Error("Upload failed")
      }
      setUploadMsg(`✅ ${files.length} file${files.length > 1 ? "s" : ""} uploaded successfully`)
      onUploaded()
    } catch {
      setUploadMsg("❌ Upload failed. Please try uploading directly in HubSpot.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
          dragging ? "border-red-400 bg-red-50" : "border-stone-200 hover:border-red-300 hover:bg-stone-50"
        }`}
      >
        <input ref={inputRef} type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
        <Paperclip className={`h-8 w-8 mx-auto mb-2 ${dragging ? "text-red-500" : "text-stone-300"}`} />
        {uploading ? (
          <p className="text-sm text-gray-500 animate-pulse">Uploading…</p>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-600">Drag and drop files here</p>
            <p className="text-xs text-gray-400 mt-1">or click to browse · Syncs directly to HubSpot</p>
          </>
        )}
      </div>
      {uploadMsg && (
        <p className={`text-xs mt-2 text-center ${uploadMsg.startsWith("✅") ? "text-emerald-600" : "text-red-600"}`}>
          {uploadMsg}
        </p>
      )}
    </div>
  )
}
