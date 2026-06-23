import React, { useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2, Paperclip, ChevronDown, CheckCircle2, AlertCircle } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────────
interface Props {
  mode: "agent" | "student"
  sessionToken: string
  prefillEmail: string       // agent email (agent mode) OR student email (student mode)
  prefillName?: string       // student's full name for pre-fill
  onSuccess?: (dealId: string) => void
}

// ── Options ────────────────────────────────────────────────────────────────────
const COURSES = [
  "Bachelor of Aviation (Flight)",
  "Bachelor of Aviation (Management)",
  "Bachelor of Business (3 Years)",
  "Bachelor of Business – Hospitality Management Specialisation (3 Years)",
  "Bachelor of Fashion and Business (2 Years)",
  "Bachelor of Information Systems (3 Years)",
  "Bachelor of Professional Accounting (3 Years)",
  "Diploma of Business Management with Bachelor of Business (3 Years)",
  "Single Unit Study – Undergraduate",
  "Undergraduate Certificate of Fashion Business",
  "Graduate Diploma in Business with MBA with MPA (2 Years)",
  "Graduate Diploma of Early Childhood",
  "Graduate Diploma of Early Childhood with Master of Teaching",
  "Master of Business Administration (1.5 Years)",
  "Master of Business Administration Professional (2 Years)",
  "Master of Business Administration with Master of Professional Accounting (2 Years)",
  "Master of Cyber Security",
  "Master of Information Systems (2 Years)",
  "Master of Professional Accounting (1.5 Years)",
  "Master of Professional Accounting with Master of Business Administration (2 Years)",
  "Master of Teaching (Early Childhood)",
  "Single Unit Study – Postgraduate",
  "Master of Business Administration Professional - Health Care Management (2 Years)",
  "Master of Business Administration Professional - Project management (2 Years)",
]

const CAMPUSES = ["Melbourne", "Sydney", "Brisbane", "Gold Coast"]

const INTAKES = [
  { value: "March_2026_23_03_2026", label: "March 2026 (23/03/2026)" },
  { value: "May 2026", label: "May 2026" },
  { value: "July_2026_20_07_2026", label: "July 2026 (20/07/2026)" },
  { value: "September 2026", label: "September 2026" },
  { value: "November_2026_09_11_2026", label: "November 2026 (09/11/2026)" },
]

const ENGLISH_TESTS = [
  { value: "IELTS", label: "IELTS" },
  { value: "PTE", label: "PTE (Pearson Test of English)" },
  { value: "TOEFL", label: "TOEFL" },
  { value: "Cambridge_English_qualification", label: "Cambridge English Qualification" },
  { value: "Australian_Studies_High_School_Diploma_Above", label: "Australian High School / Diploma or Higher" },
  { value: "Holmes_Pass_Rate_50", label: "Holmes 50% Pass Rate (Recent Semester)" },
  { value: "English_Placement_Test_Request", label: "Request English Placement Test" },
]

const RESIDENCY_STATUSES = [
  { value: "currently have an international student visa", label: "Currently have an international student visa" },
  { value: "none - currently residing outside australia", label: "None - currently residing outside Australia" },
  { value: "currently have a non-student temporary visa", label: "Currently have a non-student temporary visa" },
  { value: "australian citizen", label: "Australian citizen" },
  { value: "humanitarian visa", label: "Humanitarian visa" },
  { value: "new zealand citizen", label: "New Zealand citizen" },
  { value: "permanent visa", label: "Permanent visa" },
]

const NATIONALITIES = [
  "Afghan","Albanian","Algerian","American","Argentine","Armenian","Australian","Austrian",
  "Azerbaijani","Bahamian","Bahraini","Bangladeshi","Belgian","Bolivian","Bosnian","Brazilian",
  "British","Bruneian","Bulgarian","Cambodian","Cameroonian","Canadian","Chilean","Chinese",
  "Chinese (HK)","Colombian","Croatian","Cuban","Czech","Danish","Egyptian","Eritrean",
  "Ethiopian","Filipino","Finnish","French","German","Ghanaian","Greek","Guatemalan",
  "Honduran","Hong Kong","Hungarian","Indian","Indonesian","Iranian","Iraqi","Irish",
  "Israeli","Italian","Jamaican","Japanese","Jordanian","Kenyan","Korean","Kuwaiti","Laotian",
  "Latvian","Lebanese","Libyan","Lithuanian","Malaysian","Maldivian","Maltese","Mauritian",
  "Mexican","Moldovan","Mongolian","Moroccan","Mozambican","Namibian","Nepalese",
  "New Zealander","Nigerian","Norwegian","Omani","Pakistani","Peruvian","Polish","Portuguese",
  "Qatari","Romanian","Russian","Saudi","Senegalese","Serbian","Singaporean","South African",
  "Spanish","Sri Lankan","Sudanese","Swedish","Swiss","Syrian","Taiwanese","Tanzanian",
  "Thai","Trinidadian","Tunisian","Turkish","Ukrainian","Uruguayan","Venezuelan","Vietnamese",
  "Yemeni","Zambian","Zimbabwean","Other"
]

const YES_NO = [{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }]

// ── Helpers ────────────────────────────────────────────────────────────────────
const Sel = ({ label, name, value, onChange, options, required = false, placeholder = "Select…" }: {
  label: string; name: string; value: string; onChange: (v: string) => void
  options: { value: string; label: string }[] | string[]; required?: boolean; placeholder?: string
}) => {
  const opts = (options as any[]).map(o => typeof o === "string" ? { value: o, label: o } : o)
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <div className="relative">
        <select
          name={name} value={value} onChange={e => onChange(e.target.value)} required={required}
          className="w-full appearance-none px-3 py-2.5 pr-8 border border-stone-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
        >
          <option value="">{placeholder}</option>
          {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
      </div>
    </div>
  )
}

const Inp = ({ label, name, value, onChange, type = "text", required = false, readOnly = false, placeholder = "" }: {
  label: string; name: string; value: string; onChange?: (v: string) => void
  type?: string; required?: boolean; readOnly?: boolean; placeholder?: string
}) => (
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
    <input
      type={type} name={name} value={value} placeholder={placeholder}
      onChange={e => onChange?.(e.target.value)} required={required} readOnly={readOnly}
      className={`w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 ${readOnly ? "bg-stone-50 text-gray-500" : "bg-white"}`}
    />
  </div>
)

const Section = ({ title }: { title: string }) => (
  <div className="col-span-full mt-2">
    <h3 className="text-sm font-semibold text-red-800 border-b border-red-100 pb-1">{title}</h3>
  </div>
)

// ── Uploader (post-submission) ─────────────────────────────────────────────────
function FileUploader({ dealId }: { dealId: string }) {
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true); setMsg(null)
    try {
      for (const file of Array.from(files)) {
        const res = await fetch(`/.netlify/functions/upload?dealId=${dealId}`, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name), "X-Deal-Id": dealId },
          body: file,
        })
        if (!res.ok) throw new Error("Upload failed")
      }
      setMsg(`✅ ${files.length} file${files.length > 1 ? "s" : ""} uploaded successfully`)
    } catch { setMsg("❌ Upload failed. Please try again.") }
    finally { setUploading(false) }
  }

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => ref.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${dragging ? "border-red-400 bg-red-50" : "border-stone-200 hover:border-red-300 hover:bg-stone-50"}`}
      >
        <input ref={ref} type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
        <Paperclip className={`h-8 w-8 mx-auto mb-2 ${dragging ? "text-red-500" : "text-stone-300"}`} />
        {uploading ? <p className="text-sm text-gray-500 animate-pulse">Uploading…</p> : (
          <>
            <p className="text-sm font-medium text-gray-600">Drag and drop files here</p>
            <p className="text-xs text-gray-400 mt-1">or click to browse · PDF, JPG, PNG recommended · max 10 files</p>
          </>
        )}
      </div>
      {msg && <p className={`text-xs mt-2 text-center ${msg.startsWith("✅") ? "text-emerald-600" : "text-red-600"}`}>{msg}</p>}
    </div>
  )
}

// ── Main Form ──────────────────────────────────────────────────────────────────
export default function ApplicationForm({ mode, sessionToken, prefillEmail, prefillName, onSuccess }: Props) {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [dealId, setDealId] = useState<string | null>(null)

  const nameParts = (prefillName || "").split(" ")
  const [f, setF] = useState({
    // Personal
    firstname: mode === "student" ? nameParts[0] || "" : "",
    lastname: mode === "student" ? nameParts.slice(1).join(" ") : "",
    student_email: mode === "student" ? prefillEmail : "",
    mobile_phone_number: "",
    date_of_birth: "",
    street_name: "",
    state: "",
    post_code: "",
    country: "",
    nationality: "",
    usi_number: "",
    passport_number: "",
    residency_status: "",
    where_are_you_applying_from: "",
    disability: "",
    // Course
    course_name_australia: "",
    campus_australia: "",
    intake_australia: "",
    advanced_standing: "",
    oshc: "",
    wwcc_blue_card_number: "",
    // Prior education
    name_of_qualification: "",
    name_of_institution_attended: "",
    // English
    name_of_english_proficiency_test_australia: "",
    score: "",
    what_are_the_results_of_your_english_proficiency_test_: "",
    what_date_did_you_take_your_english_proficiency_test_: "",
    eap_required: "",
    // Additional
    do_you_intend_to_apply_for_fee_help_: "",
    course_start_date: "",
    course_end_date: "",
    ohc_english: "",
    ohcweeks: "",
  })

  const set = (k: string) => (v: string) => setF(prev => ({ ...prev, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true); setError("")
    try {
      const res = await fetch("/.netlify/functions/submit-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, ...f }),
      })
      const data = await res.json()
      if (res.status === 409 && data.dealId) {
        // Already has a deal — redirect to it
        const path = mode === "agent" ? `/applications/${data.dealId}` : `/student/application/${data.dealId}`
        window.location.href = path
        return
      }
      if (!res.ok || !data.ok) {
        setError(data.error || "Submission failed. Please try again.")
        setSubmitting(false)
        return
      }
      onSuccess?.(data.dealId)
      // Navigate straight to documents tab
      const path = mode === "agent" ? `/applications/${data.dealId}?tab=documents` : `/student/application/${data.dealId}?tab=documents`
      window.location.href = path
    } catch {
      setError("Something went wrong. Please try again.")
      setSubmitting(false)
    }
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (dealId) {
    return (
      <div className="text-center py-8 px-4">
        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">Application Submitted!</h2>
        <p className="text-sm text-gray-500 mb-6">Your application has been received. You can now upload supporting documents below.</p>
        <div className="text-left max-w-lg mx-auto mb-6">
          <p className="text-xs font-semibold text-gray-600 mb-2">Upload Supporting Documents</p>
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            For best results upload PDF, JPG, JPEG or PNG. Avoid uploading more than 10 files.
          </div>
          <FileUploader dealId={dealId} />
        </div>
        <button
          onClick={() => mode === "agent" ? navigate(`/applications/${dealId}`) : navigate(`/student/application/${dealId}`)}
          className="px-6 py-2.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-sm font-medium transition-colors"
        >
          View Application →
        </button>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* ── Personal Details ── */}
        <Section title="Personal Details" />
        <Inp label="First Name" name="firstname" value={f.firstname} onChange={set("firstname")} required placeholder="Given name" />
        <Inp label="Last Name" name="lastname" value={f.lastname} onChange={set("lastname")} required placeholder="Family name" />
        <Inp label="Student Email" name="student_email" value={f.student_email} onChange={mode === "student" ? undefined : set("student_email")} readOnly={mode === "student"} required type="email" placeholder="student@email.com" />
        {mode === "agent" && (
          <Inp label="Agent Email" name="agent_email" value={prefillEmail} readOnly type="email" />
        )}
        <Inp label="Mobile Phone Number" name="mobile_phone_number" value={f.mobile_phone_number} onChange={set("mobile_phone_number")} placeholder="+61 4XX XXX XXX" />
        <Inp label="Date of Birth" name="date_of_birth" value={f.date_of_birth} onChange={set("date_of_birth")} type="date" />

        {/* ── Address ── */}
        <Section title="Address" />
        <div className="col-span-full">
          <Inp label="Street Name" name="street_name" value={f.street_name} onChange={set("street_name")} placeholder="123 Example St" />
        </div>
        <Inp label="State" name="state" value={f.state} onChange={set("state")} placeholder="VIC" />
        <Inp label="Postcode" name="post_code" value={f.post_code} onChange={set("post_code")} placeholder="3000" />
        <Inp label="Country" name="country" value={f.country} onChange={set("country")} placeholder="Australia" />
        <Sel label="Nationality" name="nationality" value={f.nationality} onChange={set("nationality")} options={NATIONALITIES} />

        {/* ── Identity ── */}
        <Section title="Identity" />
        <Inp label="USI Number" name="usi_number" value={f.usi_number} onChange={set("usi_number")} placeholder="10-character alphanumeric (e.g. AB12CD34EF)" />
        <Inp label="Passport Number" name="passport_number" value={f.passport_number} onChange={set("passport_number")} placeholder="Passport number" />
        <Sel label="Residency Status" name="residency_status" value={f.residency_status} onChange={set("residency_status")} options={RESIDENCY_STATUSES} />
        <Sel label="Where are you applying from?" name="where_are_you_applying_from" value={f.where_are_you_applying_from} onChange={set("where_are_you_applying_from")} options={[{ value: "Onshore", label: "Onshore" }, { value: "Offshore", label: "Offshore" }]} />
        <Sel label="Do you have a disability or long-term medical condition?" name="disability" value={f.disability} onChange={set("disability")} options={YES_NO} />

        {/* ── Course ── */}
        <Section title="Course Details" />
        <div className="col-span-full">
          <Sel label="Course Name (Australia)" name="course_name_australia" value={f.course_name_australia} onChange={set("course_name_australia")} options={COURSES} required />
        </div>
        <Sel label="Campus (Australia)" name="campus_australia" value={f.campus_australia} onChange={set("campus_australia")} options={CAMPUSES} required />
        <Sel label="Intake (Australia)" name="intake_australia" value={f.intake_australia} onChange={set("intake_australia")} options={INTAKES} required />

        <Sel label="Advanced Standing" name="advanced_standing" value={f.advanced_standing} onChange={set("advanced_standing")} options={YES_NO} />
        <Sel label="OSHC" name="oshc" value={f.oshc} onChange={set("oshc")} options={YES_NO} />
        <Sel label="OHC English" name="ohc_english" value={f.ohc_english} onChange={set("ohc_english")} options={YES_NO} />
        <Inp label="OHC Weeks" name="ohcweeks" value={f.ohcweeks} onChange={set("ohcweeks")} placeholder="e.g. 10" />
        <Inp label="WWCC / Blue Card Number" name="wwcc_blue_card_number" value={f.wwcc_blue_card_number} onChange={set("wwcc_blue_card_number")} placeholder="Card number" />

        {/* ── Prior Education ── */}
        <Section title="Prior Education" />
        <Inp label="Name of Qualification" name="name_of_qualification" value={f.name_of_qualification} onChange={set("name_of_qualification")} placeholder="e.g. Bachelor of Science" />
        <Inp label="Name of Institution Attended" name="name_of_institution_attended" value={f.name_of_institution_attended} onChange={set("name_of_institution_attended")} placeholder="e.g. University of Melbourne" />

        {/* ── English Proficiency ── */}
        <Section title="English Proficiency" />
        <Sel label="English Proficiency Test" name="name_of_english_proficiency_test_australia" value={f.name_of_english_proficiency_test_australia} onChange={set("name_of_english_proficiency_test_australia")} options={ENGLISH_TESTS} />
        <Inp label="What are the results of your English Proficiency Test?" name="what_are_the_results_of_your_english_proficiency_test_" value={f.what_are_the_results_of_your_english_proficiency_test_} onChange={set("what_are_the_results_of_your_english_proficiency_test_")} placeholder="e.g. Overall 6.5, Writing 6.0" />
        <Inp label="Date you took the test" name="what_date_did_you_take_your_english_proficiency_test_" value={f.what_date_did_you_take_your_english_proficiency_test_} onChange={set("what_date_did_you_take_your_english_proficiency_test_")} type="date" />
        <Sel label="EAP Required" name="eap_required" value={f.eap_required} onChange={set("eap_required")} options={YES_NO} />

        {/* ── Additional ── */}
        <Section title="Additional Information" />
        <Sel label="Do you intend to apply for FEE HELP?" name="do_you_intend_to_apply_for_fee_help_" value={f.do_you_intend_to_apply_for_fee_help_} onChange={set("do_you_intend_to_apply_for_fee_help_")} options={YES_NO} />

      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 bg-red-700 hover:bg-red-800 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
      >
        {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</> : "Submit Application"}
      </button>

      {/* ── Document Upload ── */}
      <div className="mt-2">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-px bg-stone-200" />
          <span className="text-xs text-stone-400 uppercase tracking-wider">Supporting Documents</span>
          <div className="flex-1 h-px bg-stone-200" />
        </div>
        {!dealId ? (
          <div className="border-2 border-dashed border-stone-200 rounded-xl p-8 text-center bg-stone-50">
            <div className="w-12 h-12 rounded-full bg-white border border-stone-200 flex items-center justify-center mx-auto mb-3">
              <Paperclip className="h-5 w-5 text-stone-300" />
            </div>
            <p className="text-sm font-medium text-stone-500 mb-1">Upload supporting documents</p>
            <p className="text-xs text-stone-400 mb-4 leading-relaxed">Passport, transcripts, English test results and more.<br />Available after you submit the application above.</p>
            <div className="inline-flex items-center gap-1.5 bg-white border border-stone-200 rounded-lg px-3 py-1.5 text-xs text-stone-400">
              🔒 Submit application to unlock
            </div>
          </div>
        ) : (
          <div className="border-2 border-dashed border-red-200 rounded-xl p-8 text-center bg-red-50">
            <div className="w-12 h-12 rounded-full bg-white border border-red-200 flex items-center justify-center mx-auto mb-3">
              <Paperclip className="h-5 w-5 text-red-400" />
            </div>
            <p className="text-sm font-medium text-red-700 mb-1">Application submitted!</p>
            <p className="text-xs text-red-500 mb-4 leading-relaxed">Upload passport, transcripts, English test results and more<br />in the Documents tab of your application.</p>
            <button
              type="button"
              onClick={() => { window.location.href = mode === "agent" ? `/applications/${dealId}` : `/student/application/${dealId}` }}
              className="inline-flex items-center gap-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg px-4 py-2 text-xs font-medium transition-colors"
            >
              Go to Documents tab →
            </button>
          </div>
        )}
      </div>
    </form>
  )
}
