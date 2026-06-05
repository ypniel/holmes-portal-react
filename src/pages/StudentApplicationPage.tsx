import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { fetchDeal, fetchNotes, fetchFiles, fetchOwners, createNote } from "../lib/hubspot"
import { GraduationCap, MapPin, Calendar, FileText, MessageSquare, Paperclip, Send, LogOut, ExternalLink, Download } from "lucide-react"
import { formatDate, formatDateTime, formatRelativeTime, initials } from "../lib/utils"

export default function StudentApplicationPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [deal, setDeal] = useState<any>(null)
  const [notes, setNotes] = useState<any[]>([])
  const [files, setFiles] = useState<any[]>([])
  const [owners, setOwners] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"info" | "messages" | "documents">("info")
  const [comment, setComment] = useState("")
  const [sending, setSending] = useState(false)

  // Get student session
  const studentSession = JSON.parse(sessionStorage.getItem("holmes_student") || "{}")

  useEffect(() => {
    // Guard — must have student session
    if (!studentSession.dealId) { navigate("/student"); return }
    if (id !== studentSession.dealId) { navigate(`/student/application/${studentSession.dealId}`); return }

    if (!id) return
    Promise.all([fetchDeal(id), fetchNotes(id), fetchFiles(id), fetchOwners()])
      .then(([d, n, f, o]) => { setDeal(d); setNotes(n); setFiles(f); setOwners(o) })
      .finally(() => setLoading(false))
  }, [id])

  const handleSend = async () => {
    if (!comment.trim() || !id) return
    setSending(true)
    const ok = await createNote(id, comment.trim(), studentSession.fullName || "Student", deal?.studentName, deal?.passport)
    if (ok) {
      setComment("")
      const updated = await fetchNotes(id)
      setNotes(updated)
    }
    setSending(false)
  }

  const handleLogout = () => {
    sessionStorage.removeItem("holmes_student")
    navigate("/student")
  }

  if (loading) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="h-8 w-8 border-4 border-stone-300 border-t-red-700 rounded-full animate-spin" />
    </div>
  )

  if (!deal) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <p className="text-gray-400">Application not found.</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-red-800 text-white px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="https://holmes.edu.au/templates/images/Logo-base-banner.png" alt="Holmes" className="h-7 w-auto" onError={e => e.currentTarget.style.display = "none"} />
          <span className="text-sm font-medium text-red-200">Student Portal</span>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-red-200 hover:text-white transition-colors">
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-800">
            Welcome, {studentSession.fullName?.split(" ")[0] || "Student"}!
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Here's the status of your Holmes application.</p>
        </div>

        {/* Status card */}
        <div className="bg-gradient-to-br from-red-700 to-red-900 rounded-xl p-6 text-white mb-6 shadow-lg">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-bold mb-1">{deal.studentName}</h2>
              <div className="flex flex-wrap gap-2 text-sm text-red-200">
                {deal.passport && <span>Passport: {deal.passport}</span>}
                {deal.dob && <span>· DOB: {formatDate(deal.dob)}</span>}
              </div>
            </div>
            <span className="inline-flex items-center gap-2 bg-white/15 border border-white/25 px-4 py-1.5 rounded-full text-sm font-semibold">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              {deal.stageLabel}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {deal.courseName && (
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-xs text-red-300">Course</p>
                <p className="text-sm font-medium mt-0.5">{deal.courseName}</p>
              </div>
            )}
            {deal.campus && (
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-xs text-red-300">Campus</p>
                <p className="text-sm font-medium mt-0.5">{deal.campus}</p>
              </div>
            )}
            {deal.intake && (
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-xs text-red-300">Intake</p>
                <p className="text-sm font-medium mt-0.5">{deal.intake}</p>
              </div>
            )}
            {deal.responseStatus && (
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-xs text-red-300">Response Status</p>
                <p className="text-sm font-medium mt-0.5">{deal.responseStatus}</p>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-stone-200 p-1 flex gap-1 mb-4">
          {[
            { id: "info", label: "Application Info", icon: FileText },
            { id: "messages", label: `Messages${notes.length ? ` (${notes.length})` : ""}`, icon: MessageSquare },
            { id: "documents", label: `Documents${files.length ? ` (${files.length})` : ""}`, icon: Paperclip },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 flex-1 justify-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-red-50 text-red-700" : "text-gray-500 hover:bg-stone-50"}`}
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="bg-white rounded-xl border border-stone-200 p-6">
          {activeTab === "info" && (
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                ["Course", deal.courseName],
                ["Campus", deal.campus],
                ["Intake", deal.intake],
                ["Start Date", formatDate(deal.courseStart)],
                ["End Date", formatDate(deal.courseEnd)],
                ["OSHC", deal.oshc],
                ["Advanced Standing", deal.advancedStanding],
                ["English Test", deal.englishTestType],
                ["English Score", deal.englishScore],
                ["Total Cost", deal.totalCost],
              ].map(([label, value]) => value && value !== "—" ? (
                <div key={label as string} className="py-3 border-b border-stone-100 last:border-0">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</p>
                  <p className="text-sm text-gray-800 mt-0.5">{value}</p>
                </div>
              ) : null)}
            </div>
          )}

          {activeTab === "messages" && (
            <div className="flex flex-col h-[500px]">
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
                {notes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-8">
                    <MessageSquare className="h-8 w-8 text-stone-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No messages yet</p>
                    <p className="text-xs text-gray-400 mt-1">Send a message to Holmes Admissions below</p>
                  </div>
                ) : notes.map(note => {
                  const isStudent = note.type === "email"
                  const author = isStudent ? (studentSession.fullName?.split(" ")[0] || "You") : "Holmes Admissions"
                  return (
                    <div key={note.id} className="flex gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${isStudent ? "bg-red-100 text-red-700" : "bg-stone-100 text-stone-600"}`}>
                        {author[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-800">{author}</span>
                          <span className="text-xs text-gray-400">{formatDateTime(note.createdAt)}</span>
                        </div>
                        <div className="bg-stone-50 rounded-xl rounded-tl-none px-4 py-3 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap border border-stone-100">
                          {note.body}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="border-t border-stone-100 pt-4">
                <div className="bg-stone-50 rounded-xl border border-stone-200 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-100 transition-all">
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend() }}
                    placeholder="Send a message to Holmes Admissions…"
                    rows={3}
                    className="w-full px-4 py-3 text-sm bg-transparent focus:outline-none resize-none text-gray-700 placeholder-stone-400"
                  />
                  <div className="flex items-center justify-between px-4 pb-3">
                    <span className="text-xs text-stone-400">Ctrl+Enter to send</span>
                    <button
                      onClick={handleSend}
                      disabled={!comment.trim() || sending}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg disabled:opacity-50 transition-colors font-medium"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {sending ? "Sending…" : "Send"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "documents" && (
            <div>
              {files.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Paperclip className="h-8 w-8 text-stone-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No documents yet</p>
                  <p className="text-xs text-gray-400 mt-1">Documents will appear here once uploaded by Holmes Admissions</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {files.map((file, i) => {
                    const ext = file.name.split(".").pop()?.toUpperCase() || "FILE"
                    const isViewable = ["pdf", "jpg", "jpeg", "png"].includes(ext.toLowerCase())
                    return (
                      <div key={file.id || i} className="flex items-center gap-3 p-3 rounded-xl border border-stone-100 bg-stone-50 hover:bg-stone-100 transition-colors group">
                        <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {ext}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                          {file.createdAt && <p className="text-xs text-gray-400">{formatDateTime(new Date(file.createdAt).toISOString())}</p>}
                        </div>
                        {file.url && (
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            {...isViewable ? {} : { download: file.name }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-xs font-medium text-gray-600 hover:text-red-600 hover:border-red-200 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            {isViewable ? <><ExternalLink className="h-3 w-3" />View</> : <><Download className="h-3 w-3" />Download</>}
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Contact */}
        <div className="mt-4 bg-white rounded-xl border border-stone-200 p-5">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">Need Help?</h3>
          <div className="space-y-1 text-sm">
            <p className="text-gray-600">📞 <span className="font-medium">+61 3 9564 1444</span></p>
            <p className="text-gray-600">✉️ <span className="font-medium">admissions@holmes.edu.au</span></p>
            <p className="text-xs text-gray-400 mt-2">Monday – Friday, 9:00 AM – 5:00 PM AEST</p>
          </div>
        </div>
      </div>
    </div>
  )
}
