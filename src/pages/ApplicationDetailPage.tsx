import React, { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft, CheckCircle2, Clock, FileText, GraduationCap,
  User, Building2, MessageSquare, Send
} from "lucide-react"
import { PageContainer } from "../components/Layout"
import { fetchDeal, fetchNotes, fetchOwners, fetchFiles, createNote, Deal, Note, FileItem, PIPELINE_STAGES, BADGE_CLASSES } from "../lib/hubspot"
import { formatDate, formatDateTime, BADGE_CLASSES as BC } from "../lib/utils"

type Tab = "course" | "student" | "agent" | "chatter"

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
      setDeal(d)
      setNotes(n)
      setOwners(o)
      setFiles(f)
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

  if (loading) {
    return (
      <PageContainer>
        <p className="animate-pulse text-gray-400 text-sm py-16 text-center">Loading application…</p>
      </PageContainer>
    )
  }

  if (!deal) {
    return (
      <PageContainer>
        <p className="text-gray-400 text-sm py-16 text-center">Application not found.</p>
      </PageContainer>
    )
  }

  const currentStageIndex = PIPELINE_STAGES.indexOf(deal.stageLabel)

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "course", label: "Course Information", icon: GraduationCap },
    { id: "student", label: "Student Details", icon: User },
    { id: "agent", label: "Agent Details", icon: Building2 },
    { id: "chatter", label: "Messages", icon: MessageSquare },
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

      {/* Top Card */}
      <div className="bg-white rounded-xl border border-stone-200 p-6 mb-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{deal.studentName}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              {deal.courseName && <span>{deal.courseName}</span>}
              {deal.campus && <span>• {deal.campus}</span>}
            </div>
          </div>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${BC[deal.stageColor] || BC.stone}`}>
            {deal.stageLabel}
          </span>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6 min-w-0">
        {/* Main — Left */}
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
                </button>
              )
            })}
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden min-h-[400px] flex flex-col">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center gap-2 bg-stone-50/30">
              <ActiveIcon className="h-5 w-5 text-red-600" />
              <h2 className="font-semibold text-gray-700 text-lg">
                {tabs.find(t => t.id === activeTab)?.label}
              </h2>
            </div>
            <div className="p-6">

              {/* Course */}
              {activeTab === "course" && (
                <div className="grid md:grid-cols-2 gap-x-8">
                  <DetailRow label="Course Name" value={deal.courseName} />
                  <DetailRow label="Campus" value={deal.campus} />
                  <DetailRow label="Intake" value={deal.intake} />
                  <DetailRow label="Start Date" value={formatDate(deal.courseStart)} />
                  <DetailRow label="End Date" value={formatDate(deal.courseEnd)} />
                  <DetailRow label="Applying From" value={deal.applyingFrom} />
                  <DetailRow label="OSHC" value={deal.oshc} />
                  <DetailRow label="EAP" value={deal.eap} />
                  <DetailRow label="Advanced Standing" value={deal.advancedStanding} />
                  <DetailRow label="English Test Type" value={deal.englishTestType} />
                  <DetailRow label="English Score" value={deal.englishScore} />
                  <DetailRow label="Tuition Fees" value={deal.tuitionFees} />
                  <DetailRow label="Scholarship" value={deal.scholarship} />
                  <DetailRow label="Total Cost" value={deal.totalCost} />
                  <DetailRow label="Last Modified" value={formatDateTime(deal.lastModified)} />
                </div>
              )}

              {/* Student */}
              {activeTab === "student" && (
                <div className="grid md:grid-cols-2 gap-x-8">
                  <DetailRow label="Student Name" value={deal.studentName} />
                  <DetailRow label="Nationality" value={deal.nationality} />
                  <DetailRow label="Residency Status" value={deal.residencyStatus} />
                  <DetailRow label="Date of Birth" value={formatDate(deal.dob)} />
                  <DetailRow label="Passport Number" value={deal.passport} />
                  <DetailRow label="Student ID" value={deal.studentId} />
                  <DetailRow label="Jupiter ID" value={deal.jupiterId} />
                  <DetailRow label="Deal ID" value={deal.dealId} />
                </div>
              )}

              {/* Agent */}
              {activeTab === "agent" && (
                <div className="grid md:grid-cols-2 gap-x-8">
                  <DetailRow label="Agent Company" value={deal.agentCompany} />
                  <DetailRow label="Branch Office" value={deal.branchOffice} />
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
            </div>
          </div>

          {/* Documents */}
          {files.length > 0 && (
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-stone-100 flex items-center gap-2 bg-stone-50/30">
                <FileText className="h-5 w-5 text-red-600" />
                <h2 className="font-semibold text-gray-700 text-lg">Documents</h2>
              </div>
              <div className="p-6 space-y-3">
                {files.map(f => {
                  const ext = f.name.split(".").pop()?.toUpperCase() || "FILE"
                  return (
                    <div key={f.id} className="flex items-center justify-between p-3 rounded-lg border border-stone-100 bg-stone-50/50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-50 rounded-md flex items-center justify-center text-blue-600 text-xs font-bold">{ext}</div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{f.name}</p>
                          <p className="text-xs text-gray-500">{f.createdAt ? formatDateTime(new Date(f.createdAt).toISOString()) : "—"}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar — Right */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden sticky top-6">
            <div className="px-5 py-4 border-b border-stone-100 bg-stone-50/50">
              <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                <Clock className="h-4 w-4 text-red-600" />
                Application Timeline
              </h2>
            </div>
            <div className="p-5">
              <div className="space-y-4">
                {PIPELINE_STAGES.map((stage, idx) => {
                  const isCompleted = currentStageIndex >= 0 && idx < currentStageIndex
                  const isCurrent = idx === currentStageIndex
                  const isFuture = currentStageIndex < 0 || idx > currentStageIndex
                  return (
                    <div key={stage} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border-2 z-10 ${
                          isCompleted ? "bg-red-700 border-red-700 text-white"
                          : isCurrent ? "bg-white border-red-700 text-red-700 shadow-[0_0_0_4px_rgba(220,38,38,0.1)]"
                          : "bg-stone-50 border-stone-300 text-stone-400"
                        }`}>
                          {isCompleted ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <div className={`w-2 h-2 rounded-full ${isCurrent ? "bg-red-700" : "bg-stone-300"}`} />
                          )}
                        </div>
                        {idx < PIPELINE_STAGES.length - 1 && (
                          <div className={`w-px flex-1 my-1 min-h-[16px] ${isCompleted ? "bg-red-700" : "bg-stone-100"}`} />
                        )}
                      </div>
                      <div className="flex-1 pt-0.5 pb-4">
                        <p className={`text-sm font-medium leading-tight ${isFuture ? "text-stone-400" : "text-gray-800"}`}>
                          {stage}
                        </p>
                        {isCurrent && (
                          <span className="inline-block mt-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700">
                            Current Stage
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
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
