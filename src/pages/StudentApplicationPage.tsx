import { useEffect, useRef, useState } from "react"
import { useNavigate, useParams, useLocation } from "react-router-dom"
import { fetchDeal, fetchNotes, fetchFiles, fetchOwners, createNote } from "../lib/hubspot"
import { FileText, MessageSquare, Paperclip, Send, LogOut, ExternalLink, Download } from "lucide-react"
import { formatDate, formatDateTime } from "../lib/utils"

const MARKETERS = [
  { name: "Indra Adhikari",   title: "Victoria Representative",       email: "iadhikari@holmes.edu.au" },
  { name: "Dinesh Chetwani",  title: "Queensland Representative",      email: "dchetwani@holmes.edu.au" },
  { name: "Don Kauffman",     title: "New South Wales Representative", email: "dkauffman@holmes.edu.au" },
]

const TEAMS = [
  { name: "Agent Finance",            email: "agentfinance@holmes.edu.au",    description: "Commissions enquiries" },
  { name: "Hello",                    email: "hello@holmes.edu.au",            description: "General enquiries" },
  { name: "Deposit",                  email: "deposits@holmes.edu.au",         description: "Payment enquiries" },
  { name: "Student Services",         email: "studentservices@holmes.edu.au",  description: "Deferment, suspension, cancellation and appeal enquiries" },
  { name: "Credit Assessment Team",   email: "CAT@holmes.edu.au",              description: "Transfer credit assessment / enquiries" },
  { name: "Early Childhood Placement",email: "ecplacement@holmes.edu.au",      description: "Work placement for GDEC / Master of Teaching students enquiries" },
]

const PORTAL_ALLOWED_FILE_EXT = ["pdf", "jpg", "jpeg", "png"]
const PORTAL_MAX_FILE_SIZE = 5 * 1024 * 1024

function getFileExt(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || ""
}

function contentTypeForFile(file: File, ext: string) {
  if (file.type) return file.type
  if (ext === "pdf") return "application/pdf"
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "png") return "image/png"
  return "application/octet-stream"
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || "")
      resolve(result.includes(",") ? result.split(",")[1] : result)
    }
    reader.onerror = () => reject(reader.error || new Error("Could not read file"))
    reader.readAsDataURL(file)
  })
}

function formatIntake(value: string): string {
  if (!value) return value
  const map: Record<string, string> = {
    "July_2026_20_07_2026":     "July 2026",
    "September 2026":           "September 2026",
    "November_2026_09_11_2026": "November 2026",
    "March_2026_23_03_2026":    "March 2026",
    "May 2026":                 "May 2026",
    "July_2025_21_07_2025":     "July 2025",
    "September_2025":           "September 2025",
    "November_2025":            "November 2025",
    "March_2025":               "March 2025",
  }
  if (map[value]) return map[value]
  // Fallback: strip trailing date pattern _DD_MM_YYYY, then replace remaining underscores with spaces
  return value
    .replace(/_\d{2}_\d{2}_\d{4}$/, "")
    .replace(/_\d{4}$/, "")
    .replace(/_/g, " ")
    .trim()
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

const STUDENT_FORMS = [
  { name: "Academic Calendar 2026–2030",        url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Academic%20Calendar%202026-2030.pdf" },
  { name: "Manual Enrolment Form",              url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Manual%20Enrolment%20form.pdf" },
  { name: "Subject Variation Request Form",     url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Subject%20variation%20request%20form.pdf" },
  { name: "Special Consideration Application",  url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Special%20Consideration%20Application%20Form.pdf" },
  { name: "Study Overload Application Form",    url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Study%20Overload%20Application%20Form.pdf" },
  { name: "Request for Reduced Study Load",     url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Request%20for%20Reduced%20Study%20Load.pdf" },
  { name: "Concurrent Enrolment Form",          url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Concurrent%20enrolment%20form.pdf" },
  { name: "Appeals Form",                       url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Appeals%20Form.pdf" },
  { name: "Request for Academic Documents",     url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Request%20for%20Academic%20Documents%20Form.pdf" },
  { name: "Change of Campus or Course",         url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Change%20of%20Campus%20or%20Course.pdf" },
  { name: "Defer, Cancel and Suspend Request",  url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Defer%20Cancel%20and%20Suspend%20Request.pdf" },
  { name: "Request for Course Extension",       url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Request%20for%20course%20extension%20form.pdf" },
]

export default function StudentApplicationPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [deal, setDeal] = useState<any>(null)
  const [notes, setNotes] = useState<any[]>([])
  const [files, setFiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const urlTab = new URLSearchParams(location.search).get("tab") as "info" | "messages" | "documents" | null
  const [formsOpen, setFormsOpen] = useState(false)
  const isLive = useLiveStatus()
  const [activeTab, setActiveTab] = useState<"info" | "messages" | "documents">(urlTab || "info")
  const [comment, setComment] = useState("")
  const [sending, setSending] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const studentSession = JSON.parse(sessionStorage.getItem("holmes_student") || "{}")

  useEffect(() => {
    if (!studentSession.dealId) { navigate("/student"); return }
    if (id !== studentSession.dealId) { navigate(`/student/application/${studentSession.dealId}`); return }
    if (!id) return
    Promise.all([fetchDeal(id), fetchNotes(id), fetchFiles(id), fetchOwners()])
      .then(([d, n, f]) => { setDeal(d); setNotes(n); setFiles(f) })
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

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !id) return
    setUploading(true)
    setUploadMsg(null)
    let uploadedCount = 0
    try {
      for (const file of Array.from(fileList)) {
        const ext = getFileExt(file.name)
        if (!PORTAL_ALLOWED_FILE_EXT.includes(ext)) {
          setUploadMsg(`❌ ${file.name}: only PDF, JPG, and JPEG files are supported.`)
          continue
        }
        if (file.size > PORTAL_MAX_FILE_SIZE) {
          setUploadMsg(`❌ ${file.name} exceeds 5MB.`)
          continue
        }

        const base64 = await fileToBase64(file)
        const res = await fetch(`/.netlify/functions/upload?dealId=${id}`, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
            "X-File-Type": contentTypeForFile(file, ext),
            "X-File-Name": encodeURIComponent(file.name),
            "X-File-Size": String(file.size),
            "X-File-Base64": "true",
            "X-Deal-Id": id,
          },
          body: base64,
        })
        if (!res.ok) throw new Error("Upload failed")
        const url = `https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/HubSpot-Deals/${id}/${encodeURIComponent(file.name)}`
        setFiles(prev => [{ name: file.name, id: url, url, createdAt: Date.now() }, ...prev])
        uploadedCount += 1
      }
      if (uploadedCount > 0) setUploadMsg(`✅ ${uploadedCount} file${uploadedCount > 1 ? "s" : ""} uploaded successfully`)
    } catch {
      setUploadMsg("❌ Upload failed. Please try again.")
    } finally {
      setUploading(false)
    }
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
          <img
            src="https://holmes.edu.au/templates/images/Logo-base-banner.png"
            alt="Holmes"
            className="h-7 w-auto"
            onError={e => e.currentTarget.style.display = "none"}
          />
          <div className="flex flex-col leading-tight">
            <span className="text-white text-sm font-bold leading-none">Holmes Institute Australia</span>
            <span className="text-red-200 text-xs leading-none mt-0.5">Admissions Direct Student Portal</span>
          </div>
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
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <h2 className="text-xl font-bold mb-1">{deal.studentName}</h2>
              <div className="flex flex-wrap gap-2 text-sm text-red-200">
                {deal.passport && <span>Passport: {deal.passport}</span>}
                {deal.dob && <span>· DOB: {formatDate(deal.dob)}</span>}
              </div>
            </div>
          </div>

          {/* Pills row — case status + response status + student ID */}
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="inline-flex items-center gap-2 bg-white/15 border border-white/25 px-4 py-1.5 rounded-full text-sm font-semibold">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              {deal.stageLabel}
            </span>
            {deal.responseStatus && (
              <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold border backdrop-blur ${
                deal.responseStatus.toLowerCase().includes("holmes")
                  ? "bg-red-500/30 border-red-300/40 text-red-100"
                  : "bg-emerald-500/20 border-emerald-300/30 text-emerald-200"
              }`}>
                {deal.responseStatus}
              </span>
            )}
            {deal.studentId && (
              <span className="inline-flex items-center gap-2 bg-white/15 border border-white/25 px-4 py-1.5 rounded-full text-sm font-semibold">
                🎓 Student ID: {deal.studentId}
              </span>
            )}
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
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
                <p className="text-sm font-medium mt-0.5">{formatIntake(deal.intake)}</p>
              </div>
            )}
            {deal.studentId && (
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-xs text-red-300">Student ID</p>
                <p className="text-sm font-medium mt-0.5">{deal.studentId}</p>
              </div>
            )}
            {deal.dealId && (
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-xs text-red-300">Deal ID</p>
                <p className="text-sm font-medium mt-0.5">{deal.dealId}</p>
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

        {/* Admissions Availability */}
        <div className="bg-white rounded-xl border border-stone-200 p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800 text-sm">Need Assistance?</h3>
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold ${isLive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-stone-100 text-stone-500 border-stone-200"}`}>
              <span className={`w-2 h-2 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-stone-400"}`} />
              <span>{isLive ? "Live Now" : "Closed"}</span>
            </div>
          </div>
          <div className="space-y-2 text-sm mb-3">
            <div><p className="text-xs text-gray-500">Phone</p><p className="font-medium text-gray-900">+61 3 9662 2055</p></div>
            <div><p className="text-xs text-gray-500">Email</p><p className="font-medium text-gray-900">admissions@holmes.edu.au</p></div>
          </div>
          <div className="pt-3 border-t border-stone-100">
            <p className="text-xs text-gray-500 font-medium mb-0.5">Available Hours</p>
            <p className="text-xs text-gray-700">Monday – Friday, 9:00 AM – 5:00 PM AEST</p>
          </div>
        </div>

        {/* Forms & Documents */}
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden mb-4">
          <button onClick={() => setFormsOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-stone-50 transition-colors">
            <div className="flex items-center gap-2.5">
              <span className="text-red-700">📥</span>
              <span className="text-sm font-semibold text-gray-800">Forms &amp; Documents</span>
            </div>
            <span className="text-xs text-gray-400">{formsOpen ? "▲" : "▼"}</span>
          </button>
          {formsOpen && (
            <div className="border-t border-stone-100 divide-y divide-stone-50">
              {STUDENT_FORMS.map(form => (
                <a key={form.url} href={form.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between px-5 py-3 hover:bg-red-50 transition-colors group">
                  <span className="text-xs text-gray-700 group-hover:text-red-700 transition-colors">{form.name}</span>
                  <span className="text-gray-300 group-hover:text-red-500 text-xs ml-2">↓</span>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Tab content */}
        <div className="bg-white rounded-xl border border-stone-200 p-6">

          {/* Info tab */}
          {activeTab === "info" && (
            <div className="grid sm:grid-cols-2 gap-x-8">
              {[
                ["Course", deal.courseName],
                ["Campus", deal.campus],
                ["Intake", formatIntake(deal.intake)],
                ["Start Date", formatDate(deal.courseStart)],
                ["End Date", formatDate(deal.courseEnd)],
                ["OSHC", deal.oshc],
                ["Advanced Standing", deal.advancedStanding],
                ["English Test", deal.englishTestType],
                ["English Score", deal.englishScore],
                ["Total Cost", deal.totalCost],
                ["Student ID", deal.studentId],
                ["Deal ID", deal.dealId],
              ].map(([label, value]) => value && value !== "—" ? (
                <div key={label as string} className="py-3 border-b border-stone-100 last:border-0">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</p>
                  <p className="text-sm text-gray-800 mt-0.5">{value}</p>
                </div>
              ) : null)}
            </div>
          )}

          {/* Messages tab */}
          {activeTab === "messages" && (
            <div className="flex flex-col h-[500px]">
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-3 w-full">
                <span className="text-amber-500 mt-0.5 flex-shrink-0">⏱</span>
                <p className="text-xs text-amber-800 leading-relaxed">
                  <span className="font-semibold">Response time: 24–48 hours</span> for standard cases.
                  Cases with credit assessment requests may take up to <span className="font-semibold">72 hours</span>.
                  Please do not chase up before this window has passed.
                </p>
              </div>
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

          {/* Documents tab */}
          {activeTab === "documents" && (
            <div>
              {/* Upload area */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); handleUpload(e.dataTransfer.files) }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all mb-4 ${dragging ? "border-red-400 bg-red-50" : "border-stone-200 hover:border-red-300 hover:bg-stone-50"}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={e => handleUpload(e.target.files)}
                />
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
                <p className={`text-xs mb-3 text-center ${uploadMsg.startsWith("✅") ? "text-emerald-600" : "text-red-600"}`}>
                  {uploadMsg}
                </p>
              )}

              {/* File list */}
              {files.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Paperclip className="h-8 w-8 text-stone-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No documents yet</p>
                  <p className="text-xs text-gray-400 mt-1">Upload above or wait for Holmes Admissions to attach documents</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {files.map((file, i) => {
                    const ext = file.name?.split(".").pop()?.toUpperCase() || "FILE"
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
                          <button
                            type="button"
                            onClick={async () => {
                              const token = sessionStorage.getItem("holmes_student_token") || sessionStorage.getItem("holmes_session_token") || ""
                              const url = `/.netlify/functions/download-file?fileId=${encodeURIComponent(file.id)}&dealId=${encodeURIComponent(id || "")}`
                              try {
                                const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } })
                                if (!res.ok) { alert("You do not have permission to access this file."); return }
                                const blob = await res.blob()
                                const blobUrl = URL.createObjectURL(blob)
                                const a = document.createElement("a")
                                a.href = blobUrl
                                if (isViewable) { a.target = "_blank" } else { a.download = file.name }
                                a.click()
                                setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
                              } catch { alert("Failed to open file.") }
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-xs font-medium text-gray-600 hover:text-red-600 hover:border-red-200 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            {isViewable ? <><ExternalLink className="h-3 w-3" />View</> : <><Download className="h-3 w-3" />Download</>}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Need Help box */}
        <div className="mt-4 bg-white rounded-xl border border-stone-200 p-5">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">You can reach out to our other teams at:</h3>
          {/* Sales Reps */}
          <div className="space-y-2 mb-3">
            {MARKETERS.map(m => (
              <a key={m.email} href={`mailto:${m.email}`}
                className="flex items-center gap-3 p-3 rounded-lg border border-stone-100 hover:border-red-200 hover:bg-red-50 transition-colors group"
              >
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-700 font-bold text-xs flex-shrink-0">
                  {m.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 group-hover:text-red-700 transition-colors">{m.name}</p>
                  <p className="text-xs text-gray-500">{m.title}</p>
                  <p className="text-xs text-red-600 mt-0.5">{m.email}</p>
                </div>
              </a>
            ))}
          </div>
          {/* Divider */}
          <div className="border-t border-stone-100 my-3" />
          {/* Teams */}
          <div className="space-y-2">
            {TEAMS.map(t => (
              <a key={t.email} href={`mailto:${t.email}`}
                className="flex items-center gap-3 p-3 rounded-lg border border-stone-100 hover:border-red-200 hover:bg-red-50 transition-colors group"
              >
                <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 font-bold text-xs flex-shrink-0">
                  {t.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 group-hover:text-red-700 transition-colors">{t.name}</p>
                  <p className="text-xs text-gray-500">{t.description}</p>
                  <p className="text-xs text-red-600 mt-0.5">{t.email}</p>
                </div>
              </a>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
