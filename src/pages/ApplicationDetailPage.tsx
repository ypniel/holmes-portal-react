import React, { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft, FileText, GraduationCap, User, Building2, MessageSquare, Send, Paperclip, Dot
} from "lucide-react"
import { PageContainer } from "../components/Layout"
import { fetchDeal, fetchNotes, fetchOwners, fetchFiles, createNote, Deal, Note, FileItem, BADGE_CLASSES } from "../lib/hubspot"
import { formatDate, formatDateTime, BADGE_CLASSES as BC } from "../lib/utils"

type Tab = "course" | "student" | "agent" | "chatter" | "documents"

export default function ApplicationDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [deal, setDeal] = useState<Deal | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [owners, setOwners] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<FileItem[]>([])
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
    ]).then(([d, n, o, f]) => {
      setDeal(d); setNotes(n); setOwners(o); setFiles(f)
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

      {/* Top Card — beautiful gradient header */}
      <div className="relative rounded-xl overflow-hidden mb-6 shadow-lg">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-red-800 via-red-700 to-red-900" />
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "60px 60px" }}
        />
        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* Avatar + Name */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur border-2 border-white/30 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                  {deal.studentName.split(" ").map(p => p[0]).join("").slice(0,2).toUpperCase()}
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white leading-tight">{deal.studentName}</h1>
                  <p className="text-red-200 text-sm mt-0.5">{deal.courseName || "Holmes Education Group"}</p>
                </div>
              </div>

              {/* Stage badge — prominent */}
              <div className="mb-4">
                <span className="inline-flex items-center gap-2 bg-white/15 backdrop-blur border border-white/25 text-white px-4 py-1.5 rounded-full text-sm font-semibold">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  {deal.stageLabel}
                </span>
              </div>

              {/* ID pills */}
              <div className="flex flex-wrap gap-2">
                {deal.dealId && (
                  <span className="text-xs bg-black/20 text-red-100 px-2.5 py-1 rounded-full font-mono border border-white/10">
                    Deal: {deal.dealId}
                  </span>
                )}
                {deal.studentId && (
                  <span className="text-xs bg-black/20 text-red-100 px-2.5 py-1 rounded-full font-mono border border-white/10">
                    Student: {deal.studentId}
                  </span>
                )}
                {deal.jupiterId && (
                  <span className="text-xs bg-black/20 text-red-100 px-2.5 py-1 rounded-full font-mono border border-white/10">
                    Jupiter: {deal.jupiterId}
                  </span>
                )}
              </div>
            </div>

            {/* Right side — campus + intake */}
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
                  <p className="text-white font-semibold">{deal.intake}</p>
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
          <div className="bg-white rounded-xl border border-stone-200 p-1 flex overflow-x-auto">
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
                    <span className="ml-1 bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded-full font-semibold">
                      {files.length}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden min-h-[400px] flex flex-col">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center gap-2 bg-stone-50/30">
              <ActiveIcon className="h-5 w-5 text-red-600" />
              <h2 className="font-semibold text-gray-700 text-lg">{tabs.find(t => t.id === activeTab)?.label}</h2>
            </div>
            <div className="p-6">

              {/* Course */}
              {activeTab === "course" && (
                <div className="grid md:grid-cols-2 gap-x-8">
                  <DetailRow label="Course Name"       value={deal.courseName} />
                  <DetailRow label="Campus"            value={deal.campus} />
                  <DetailRow label="Intake"            value={deal.intake} />
                  <DetailRow label="Start Date"        value={formatDate(deal.courseStart)} />
                  <DetailRow label="End Date"          value={formatDate(deal.courseEnd)} />
                  <DetailRow label="Applying From"     value={deal.applyingFrom} />
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

              {/* Student */}
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

              {/* Agent */}
              {activeTab === "agent" && (
                <div className="grid md:grid-cols-2 gap-x-8">
                  <DetailRow label="Agent Company" value={deal.agentCompany} />
                  <DetailRow label="Branch Office" value={deal.branchOffice} />
                  <DetailRow label="Applying From" value={deal.applyingFrom} />
                </div>
              )}

              {/* Chatter */}
              {activeTab === "chatter" && (
                <div className="flex flex-col h-[500px]">
                  <div className="flex-1 space-y-6 overflow-y-auto pr-2 mb-4">
                    {notes.length === 0 ? (
                      <p className="text-center text-sm text-gray-400 py-8 italic">No messages yet.</p>
                    ) : notes.map(note => {
                      let body = note.body
                      let author = owners[note.ownerId] || "HubSpot User"
                      if (body.startsWith("[Portal Comment —")) {
                        try {
                          author = body.split("—")[1].split("]")[0].trim()
                          body = body.split("]\n\n")[1] || body
                        } catch {}
                      }
                      return (
                        <div key={note.id} className="relative pl-6 border-l-2 border-stone-200">
                          <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-red-600 border-2 border-white" />
                          <div className="text-xs text-red-700 font-semibold mb-1">{formatDateTime(note.createdAt)}</div>
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">{body}</p>
                        </div>
                      )
                    })}
                  </div>
                  <div className="pt-4 border-t border-stone-100">
                    <textarea
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder="Write a message..."
                      rows={3}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 resize-none bg-stone-50/50"
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={handlePostComment}
                        disabled={!comment.trim() || sending}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg disabled:opacity-50 transition-colors"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {sending ? "Sending…" : "Send Message"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Documents */}
              {activeTab === "documents" && (
                <div>
                  {files.length === 0 ? (
                    <div className="text-center py-12">
                      <Paperclip className="h-10 w-10 text-stone-300 mx-auto mb-3" />
                      <p className="text-sm text-gray-500">No documents attached yet.</p>
                      <p className="text-xs text-gray-400 mt-1">Upload files through HubSpot and they'll appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {files.map((f, i) => {
                        const ext = f.name && f.name !== "Unknown"
                          ? f.name.split(".").pop()?.toUpperCase() || "FILE"
                          : "FILE"
                        const displayName = f.name && f.name !== "Unknown" ? f.name : `Document ${i + 1}`
                        const dateStr = f.createdAt
                          ? formatDateTime(new Date(f.createdAt).toISOString())
                          : "—"
                        return (
                          <div key={f.id || i} className="flex items-center gap-3 p-3 rounded-lg border border-stone-100 bg-stone-50/50">
                            <div className="w-9 h-9 bg-blue-50 rounded-md flex items-center justify-center text-blue-600 text-xs font-bold flex-shrink-0">
                              {ext}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{displayName}</p>
                              <p className="text-xs text-gray-500">{dateStr}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar — Pro Tip + Contact Holmes (replaces timeline) */}
        <div className="lg:col-span-4 space-y-4">

          {/* Key Dates */}
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <div className="font-semibold text-gray-700 text-sm mb-3">📅 Key Dates</div>
            <div className="space-y-3 text-sm">
              <div><p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Date Added</p><p className="font-medium text-gray-800">{formatDate(deal.createdAt)}</p></div>
              <div><p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Last Modified</p><p className="font-medium text-gray-800">{formatDate(deal.lastModified)}</p></div>
              <div><p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Course Start</p><p className="font-medium text-gray-800">{formatDate(deal.courseStart)}</p></div>
              <div><p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Course End</p><p className="font-medium text-gray-800">{formatDate(deal.courseEnd)}</p></div>
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
              <div>
                <p className="text-xs text-gray-500">Phone</p>
                <p className="font-medium text-gray-900">+61 3 9564 1444</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Email</p>
                <p className="font-medium text-gray-900">admissions@holmes.edu.au</p>
              </div>
            </div>
            <div className="pt-3 border-t border-stone-100">
              <p className="text-xs text-gray-500 font-medium mb-0.5">Available Hours</p>
              <p className="text-xs text-gray-700">Monday – Friday, 9:00 AM – 5:00 PM AEST</p>
            </div>
          </div>

          {/* Pro Tip */}
          <div className="bg-red-50 rounded-xl border border-red-100 p-5">
            <h3 className="font-semibold text-gray-800 text-sm mb-2 flex items-center gap-2">
              ✓ Pro Tip
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

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 py-3 border-b border-stone-100 last:border-0">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider sm:w-1/3">{label}</span>
      <span className="text-sm text-gray-800">{value || "—"}</span>
    </div>
  )
}
