import React, { useEffect, useState } from "react"
import { useNavigate, useParams, useLocation } from "react-router-dom"
import {
  ArrowLeft, FileText, GraduationCap, User, Building2,
  MessageSquare, Send, Paperclip, Dot, Download, ExternalLink, X,
  FileDown,
} from "lucide-react"
import { PageContainer } from "../components/Layout"
import {
  fetchDeal, fetchNotes, fetchOwners, fetchFiles, fetchDealCompany,
  createNote, Deal, Note, FileItem, Company
} from "../lib/hubspot"
import { formatDate, formatDateTime, formatIntake, BADGE_CLASSES as BC, initials } from "../lib/utils"
const titleCase = (s: string) => s
  ? s.replace(/_/g, " ").replace(/\w/g, c => c.toUpperCase())
  : s

const ENGLISH_TEST_LABELS: Record<string, string> = {
  "IELTS": "IELTS",
  "PTE": "PTE (Pearson Test of English)",
  "TOEFL": "TOEFL",
  "Cambridge_English_qualification": "Cambridge English Qualification",
  "Australian_Studies_High_School_Diploma_Above": "Australian High School / Diploma or Higher",
  "Holmes_Pass_Rate_50": "50% Pass Rate (Recent Semester)",
  "English_Placement_Test_Request": "Request English Placement Test",
}

const formatEnglishTest = (v: string) => ENGLISH_TEST_LABELS[v] || titleCase(v)


import { useAuth, isHolmesStaff } from "../lib/auth"
import { DetailPageSkeleton } from "../components/Skeleton"

const MARKETERS = [
  { name: "Indra Adhikari",   title: "Victoria Representative",       email: "iadhikari@holmes.edu.au", phone: "0414 813 163" },
  { name: "Dinesh Chetwani",  title: "Queensland Representative",      email: "dchetwani@holmes.edu.au", phone: "0449 536 879" },
  { name: "Don Kauffman",     title: "New South Wales Representative", email: "dkauffman@holmes.edu.au", phone: "0450 224 845" },
]

const TEAMS = [
  { name: "Agent Finance",             email: "agentfinance@holmes.edu.au",   description: "Commissions enquiries" },
  { name: "Hello",                     email: "hello@holmes.edu.au",           description: "General enquiries" },
  { name: "Deposit",                   email: "deposits@holmes.edu.au",        description: "Payment enquiries" },
  { name: "Student Services",          email: "studentservices@holmes.edu.au", description: "Deferment, suspension, cancellation and appeal enquiries" },
  { name: "Credit Assessment Team",    email: "CAT@holmes.edu.au",             description: "Transfer credit assessment / enquiries" },
  { name: "Early Childhood Placement", email: "ecplacement@holmes.edu.au",     description: "Work placement for GDEC / Master of Teaching students enquiries" },
]

type Tab = "course" | "student" | "agent" | "chatter" | "documents"

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


const AGENT_FORMS = [
  { name: "Academic Calendar 2026–2030",        url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Academic%20Calendar%202026-2030.pdf" },
  { name: "Manual Enrolment Form",              url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Manual%20Enrolment%20form.pdf" },
  { name: "Subject Variation Request Form",     url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Subject%20variation%20request%20form.pdf" },
  { name: "Special Consideration Application",  url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Special%20Consideration%20Application%20Form.pdf" },
  { name: "Study Overload Application Form",    url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Study%20Overload%20Application%20Form.pdf" },
  { name: "Request for Reduced Study Load",     url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Request%20for%20Reduced%20Study%20Load.pdf" },
  { name: "Concurrent Enrolment Form",          url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Concurrent%20enrolment%20form.pdf" },
  { name: "Request for Documents",              url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Request%20for%20Documents.pdf" },
  { name: "Appeals Form",                       url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Appeals%20Form.pdf" },
  { name: "Request for Academic Documents",     url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Request%20for%20Academic%20Documents%20Form.pdf" },
  { name: "Change of Campus or Course",         url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Change%20of%20Campus%20or%20Course.pdf" },
  { name: "Defer, Cancel and Suspend Request",  url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Defer%20Cancel%20and%20Suspend%20Request.pdf" },
  { name: "Request for Course Extension",       url: "https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/Holmes%20Admission/Request%20for%20course%20extension%20form.pdf" },
]

export default function ApplicationDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const DIRECT_STUDENT_EMAILS = ["leticia.fernansilva@gmail.com"]
  const isStaff = !!user && isHolmesStaff(user.email)
  const isDirectStudent = !!user && (
    DIRECT_STUDENT_EMAILS.includes(user.email) ||
    user.companyName?.toLowerCase() === "direct student"
  )
  const [deal, setDeal] = useState<Deal | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [owners, setOwners] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<FileItem[]>([])
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const location = useLocation()
  const urlTab = (new URLSearchParams(location.search).get("tab") as Tab) || "course"
  const [activeTab, setActiveTab] = useState<Tab>(urlTab)

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    navigate(`?tab=${tab}`, { replace: true })
  }
  const [comment, setComment] = useState("")
  const [sending, setSending] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [formsOpen, setFormsOpen] = useState(false)
  const isLive = useLiveStatus()

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
    const authorName = user?.companyName || user?.fullName || user?.email || "Agent"
    const ok = await createNote(id, comment.trim(), authorName, deal?.studentName, deal?.passport)
    if (ok) {
      setComment("")
      const updated = await fetchNotes(id)
      setNotes(updated)
    }
    setSending(false)
  }

  if (loading) return (
    <PageContainer>
      <button onClick={() => navigate("/applications")} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors mb-6 group">
        <ArrowLeft className="h-4 w-4" /> Back to Applications
      </button>
      <DetailPageSkeleton />
    </PageContainer>
  )
  if (!deal) return <PageContainer><p className="text-gray-400 text-sm py-16 text-center">Application not found.</p></PageContainer>

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "course",    label: "Course Information", icon: GraduationCap },
    { id: "student",   label: "Student Details",    icon: User },
    ...(!isDirectStudent ? [{ id: "agent" as Tab, label: "Agent Details", icon: Building2 }] : []),
    { id: "chatter",   label: "Messages",           icon: MessageSquare },
    { id: "documents", label: "Documents",          icon: Paperclip },
  ]
  const ActiveIcon = tabs.find(t => t.id === activeTab)?.icon || FileText

  return (
    <>
    <PageContainer className="min-w-0 w-full">
      {/* Back — hidden for direct students */}
      {!isDirectStudent && (
        <button
          onClick={() => navigate("/applications")}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors mb-6 group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to Applications
        </button>
      )}

      {/* ── Beautiful gradient top card ── */}
      <div className="relative rounded-xl overflow-hidden mb-6 shadow-lg w-full">
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
              {/* Stage badge + Response Status */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 bg-white/15 backdrop-blur border border-white/25 text-white px-4 py-1.5 rounded-full text-sm font-semibold">
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
              </div>
              {/* ID pills */}
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 bg-white/10 text-white px-3 py-1.5 rounded-full border border-white/20 font-medium">
                  <span className="text-white/50 text-[10px] uppercase tracking-widest">Deal</span>
                  <span>{deal.dealId}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 bg-white/10 text-white px-3 py-1.5 rounded-full border border-white/20 font-medium">
                  <span className="text-white/50 text-[10px] uppercase tracking-widest">Student ID</span>
                  <span>{deal.studentId || "—"}</span>
                </span>
                {deal.jupiterId && (
                  <span className="inline-flex items-center gap-1.5 bg-white/10 text-white px-3 py-1.5 rounded-full border border-white/20 font-medium">
                    <span className="text-white/50 text-[10px] uppercase tracking-widest">Jupiter Legacy System ID</span>
                    <span>{deal.jupiterId}</span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:text-right min-w-0">
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

      <div className="grid lg:grid-cols-12 gap-6 min-w-0 w-full">
        {/* Main Left */}
        <div className="lg:col-span-8 space-y-6 min-w-0 w-full">
          {/* Tabs */}
          <div className="bg-white rounded-xl border border-stone-200 p-1 flex overflow-x-auto gap-1">
            {tabs.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
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
          <p className="block sm:hidden text-center text-xs text-gray-400 -mt-2 mb-1">👆 Tap a tab above to switch sections</p>

          {/* Tab Content */}
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden min-h-[400px]">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center gap-2 bg-stone-50/30">
              <ActiveIcon className="h-5 w-5 text-red-600" />
              <h2 className="font-semibold text-gray-700 text-lg">{tabs.find(t => t.id === activeTab)?.label}</h2>
            </div>
            <div className="p-6">

              {/* ── Course ── */}
              {activeTab === "course" && (
                <div>
                  <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800 leading-relaxed">
                    <p className="font-semibold mb-0.5">ℹ️ Please note</p>
                    <p>Course start date, end date, tuition fees, scholarship and total cost will be updated once the case has been assessed. Please allow 24–72 hours.</p>
                  </div>
                  <div className="grid md:grid-cols-2 gap-x-8">
                  <DetailRow label="Course Name"       value={deal.courseName} />
                  <DetailRow label="Campus"            value={deal.campus} />
                  <DetailRow label="Intake"            value={formatIntake(deal.intake)} />
                  <DetailRow label="Start Date"        value={formatDate(deal.courseStart)} />
                  <DetailRow label="End Date"          value={formatDate(deal.courseEnd)} />
                  <DetailRow label="Do you require OSHC from us?" value={titleCase(deal.oshc)} />
                  <DetailRow label="English course prior to starting" value={titleCase(deal.ohcEnglish)} />
                  <DetailRow label="Advanced Standing" value={titleCase(deal.advancedStanding)} />
                  {deal.wwcc && <DetailRow label="WWCC / Blue Card Number" value={titleCase(deal.wwcc)} />}
                  <DetailRow label="English Proficiency Test" value={formatEnglishTest(deal.englishTestType)} />
                  <DetailRow label="English Proficiency Results" value={deal.englishScore} />
                  <DetailRow label="English Test Date"   value={deal.englishTestDate} />
                  <DetailRow label="Tuition Fees"      value={deal.tuitionFees} />
                  <DetailRow label="Scholarship"       value={deal.scholarship} />
                  <DetailRow label="Total Cost"        value={deal.totalCost} />
                  <DetailRow label="Last Modified"     value={formatDateTime(deal.lastModified)} />
                  </div>
                </div>
              )}

              {/* ── Student ── */}
              {activeTab === "student" && (
                <div className="grid md:grid-cols-2 gap-x-8">
                  <DetailRow label="Student Name"      value={deal.studentName} />
                  <DetailRow label="Email"             value={deal.studentEmail} />
                  <DetailRow label="Phone"             value={deal.studentPhone} />
                  <DetailRow label="Street"            value={deal.streetName} />
                  <DetailRow label="City"              value={deal.city} />
                  <DetailRow label="Postcode"          value={deal.postCode} />
                  <DetailRow label="Country"           value={titleCase(deal.nationality)} />
                  <DetailRow label="Residency Status"  value={titleCase(deal.residencyStatus)} />
                  <DetailRow label="Date of Birth"     value={formatDate(deal.dob)} />
                  <DetailRow label="Passport Number"   value={deal.passport} />
                  <DetailRow label="WWCC / Blue Card"  value={titleCase(deal.wwcc)} />
                  <DetailRow label="Student ID"        value={deal.studentId} />
                  <DetailRow label="Deal ID"           value={deal.dealId} />
                </div>
              )}

              {/* ── Agent ── */}
              {activeTab === "agent" && (
                <div className="grid md:grid-cols-2 gap-x-8">
                  <DetailRow label="Agent Company"  value={company?.name || deal.agentCompany} />
                  <DetailRow label="Email"          value={company?.email || deal.agentEmail} />
                  <DetailRow label="City"           value={company?.city} />
                  <DetailRow label="Country"        value={company?.country} />
                </div>
              )}

              {/* ── Chatter ── */}
              {activeTab === "chatter" && (
                <div className="flex flex-col h-[500px]">
                  {/* Response time notice */}
                  <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-3 w-full">
                    <span className="text-amber-500 mt-0.5 flex-shrink-0">⏱</span>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      <span className="font-semibold">Response time: 24–48 hours</span> for standard cases.
                      Cases with credit assessment requests may take up to <span className="font-semibold">72 hours</span>.
                      Please do not chase up before this window has passed.
                    </p>
                  </div>
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
                      const isEmail = note.type === "email"
                      const isHolmes = note.author === "Holmes Admissions" || (!isEmail && !note.author)
                      const author = note.author || (isHolmes ? "Holmes Admissions" : owners[note.ownerId] || "Holmes Admissions")
                      const authorInitials = initials(author)
                      return (
                        <div key={note.id} className="flex gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${isEmail ? "bg-red-100 text-red-700" : "bg-stone-100 text-stone-600"}`}>
                            {authorInitials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold text-gray-800">{author}</span>
                              <span className="text-xs text-gray-400">{formatDateTime(note.createdAt)}</span>
                              {isEmail && <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-medium">Portal</span>}
                              {!isEmail && <span className="text-xs bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded font-medium">Internal</span>}
                            </div>
                            <div className="bg-stone-50 rounded-xl rounded-tl-none px-4 py-3 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words border border-stone-100 max-w-full overflow-hidden">
                              {note.body}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Message input */}
                  <div className="border-t border-stone-100 pt-4">
                    {isStaff ? (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 text-center">
                        ⚠️ Holmes staff are in view-only mode. Messaging is disabled.
                      </div>
                    ) : (
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
                    )}
                  </div>
                </div>
              )}

              {/* ── Documents ── */}
              {activeTab === "documents" && (
                <div>
                  {/* Format warning */}
                  <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
                    <span className="text-amber-500 flex-shrink-0 mt-0.5">⚠️</span>
                    <div className="text-xs text-amber-800 leading-relaxed">
                      <p className="font-semibold mb-0.5">For the best viewing experience, please upload documents in PDF or JPG/JPEG format.</p>
                      <p>Maximum file size is 5 MB per file.</p>
                      <p>Files such as PNG, HEIC, DOCX, XLSX, PPTX, and ZIP may not be previewable within the portal. Please also avoid uploading too many files — a maximum of 10 is recommended.</p>
                    </div>
                  </div>
                  {/* Upload area */}
                  {isStaff ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 text-center">
                      ⚠️ Holmes staff are in view-only mode. Document upload is disabled.
                    </div>
                  ) : (
                  <DocumentUploader dealId={deal.id} onUploaded={() => {
                    fetchFiles(deal.id).then(setFiles)
                  }} onOptimisticFile={(f) => setFiles(prev => [f, ...prev])} />
                  )}

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
                          let cleanName = f.name || `Document ${i + 1}`
                          const hashMatch = cleanName.match(/^[a-f0-9]{13}-(.+)$/)
                          if (hashMatch) cleanName = hashMatch[1]
                          cleanName = cleanName.replace(/_/g, " ")
                          const ext = cleanName.includes(".") ? cleanName.split(".").pop()?.toUpperCase() || "FILE" : "FILE"
                          const extLower = ext.toLowerCase()
                          const isViewable = ["pdf","jpg","jpeg","png","gif","webp","svg"].includes(extLower)
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
                                <p className="text-sm font-medium text-gray-800 truncate">{cleanName}</p>
                                <p className="text-xs text-gray-400">{dateStr}</p>
                              </div>
                              {f.url && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const token = sessionStorage.getItem("holmes_session_token") || ""
                                    const url = `/.netlify/functions/download-file?fileId=${encodeURIComponent(f.id)}&dealId=${encodeURIComponent(id || "")}`
                                    try {
                                      const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } })
                                      if (!res.ok) { alert("You do not have permission to access this file."); return }
                                      const blob = await res.blob()
                                      const blobUrl = URL.createObjectURL(blob)
                                      const a = document.createElement("a")
                                      a.href = blobUrl
                                      if (isViewable) { a.target = "_blank" } else { a.download = cleanName }
                                      a.click()
                                      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
                                    } catch { alert("Failed to open file.") }
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-xs font-medium text-gray-600 hover:text-red-600 hover:border-red-200 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  {isViewable
                                    ? <><ExternalLink className="h-3 w-3" />View</>
                                    : <><Download className="h-3 w-3" />Download</>
                                  }
                                </button>
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
        <div className="lg:col-span-4 space-y-4 min-w-0 w-full">
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
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold ${isLive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-stone-100 text-stone-500 border-stone-200"}`}>
                <Dot className={`h-3 w-3 fill-current ${isLive ? "animate-pulse" : ""}`} />
                <span className="text-xs font-semibold">{isLive ? "Live Now" : "Closed"}</span>
              </div>
            </div>
            <div className="space-y-2 text-sm mb-3">
              <div><p className="text-xs text-gray-500">Phone</p><p className="font-medium text-gray-900">+61 3 9662 2055</p></div>
              <div><p className="text-xs text-gray-500">Email</p><p className="font-medium text-gray-900">admissions@holmes.edu.au</p></div>
            </div>
            <div className="pt-3 border-t border-stone-100">
              <p className="text-xs text-gray-500 font-medium mb-0.5">Available Hours</p>
              <p className="text-xs text-gray-700">Monday – Friday, 9:00 AM – 5:00 PM AEST</p>
              <button
                onClick={() => setShowModal(true)}
                className="mt-3 w-full py-2 text-xs font-medium text-red-600 hover:text-red-700 border border-red-200 hover:bg-red-50 rounded-lg transition-colors"
              >
                Contact our Holmes Teams →
              </button>
            </div>
          </div>


          {/* Forms & Documents */}
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <button
              onClick={() => setFormsOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-stone-50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <FileDown className="h-4 w-4 text-red-700" />
                <span className="text-sm font-semibold text-gray-800">Forms &amp; Documents</span>
              </div>
              <span className="text-xs text-gray-400">{formsOpen ? "▲" : "▼"}</span>
            </button>
            {formsOpen && (
              <div className="border-t border-stone-100 divide-y divide-stone-50">
                {AGENT_FORMS.map(form => (
                  <a
                    key={form.url}
                    href={form.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between px-5 py-3 hover:bg-red-50 transition-colors group"
                  >
                    <span className="text-xs text-gray-700 group-hover:text-red-700 transition-colors">{form.name}</span>
                    <FileDown className="h-3.5 w-3.5 text-gray-300 group-hover:text-red-500 flex-shrink-0 ml-2 transition-colors" />
                  </a>
                ))}
              </div>
            )}
          </div>
          {/* Pro Tip — rotating */}
          <RotatingProTip />
        </div>
      </div>
    </PageContainer>

    {/* Need Help Modal */}
    {showModal && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Need Help?</h2>
              <p className="text-sm text-gray-500 mt-0.5">You can reach out to other teams at:</p>
            </div>
            <button onClick={() => setShowModal(false)} className="text-stone-400 hover:text-stone-600 p-1"><X className="h-5 w-5" /></button>
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
                  {m.phone && <p className="text-xs text-gray-500 mt-0.5">📞 {m.phone}</p>}
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
  </>
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
  "Keep student documents up to date to ensure faster processing times for offer letter and COE applications.",
  "Submit Australian academic transcript or English test results early — verification delays are the most common cause of offer letter and COE hold-ups.",
  "Ensure the student's name on all documents exactly matches the passport. Discrepancies cause significant delays.",
  "Advanced Standing applications take longer to assess — submit these cases as early as possible before intake.",
  "For onshore students, make sure their current visa allows them to study before submitting an application.",
  "Always remember to submit passport, English test, offshore and onshore transcript, OSHC and WWCC/Blue Card (for Teaching related courses).",
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

function DocumentUploader({ dealId, onUploaded, onOptimisticFile }: { 
  dealId: string
  onUploaded: () => void
  onOptimisticFile: (file: FileItem) => void
}) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadMsg(null)
    let uploadedCount = 0
    try {
      for (const file of Array.from(files)) {
        const ext = getFileExt(file.name)
        if (!PORTAL_ALLOWED_FILE_EXT.includes(ext)) {
          setUploadMsg(`❌ ${file.name}: only PDF, JPG, JPEG and PNG files are supported.`)
          continue
        }
        if (file.size > PORTAL_MAX_FILE_SIZE) {
          setUploadMsg(`❌ ${file.name} exceeds 5MB.`)
          continue
        }

        const base64 = await fileToBase64(file)
        const res = await fetch(`/.netlify/functions/upload?dealId=${dealId}`, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
            "X-File-Type": contentTypeForFile(file, ext),
            "X-File-Name": encodeURIComponent(file.name),
            "X-File-Size": String(file.size),
            "X-File-Base64": "true",
            "X-Deal-Id": dealId,
          },
          body: base64,
        })
        if (!res.ok) throw new Error("Upload failed")
        // Optimistically add file to list immediately
        const cdnUrl = `https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/HubSpot-Deals/${dealId}/${encodeURIComponent(file.name)}`
        onOptimisticFile({ name: file.name, id: cdnUrl, url: cdnUrl, createdAt: Date.now() })
        uploadedCount += 1
      }
      if (uploadedCount > 0) {
        setUploadMsg(`✅ ${uploadedCount} file${uploadedCount > 1 ? "s" : ""} uploaded successfully`)
        onUploaded()
      }
    } catch {
      setUploadMsg("❌ Upload failed. Please try again.")
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
        <input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => handleFiles(e.target.files)} />
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
