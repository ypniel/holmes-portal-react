import React, { useState, useRef, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2, Paperclip, ChevronDown, AlertCircle, Search } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────────
interface Props {
  mode: "agent" | "student"
  sessionToken: string
  prefillEmail: string
  prefillName?: string
  onSuccess?: (dealId: string) => void
}

// ── Constants ──────────────────────────────────────────────────────────────────
const WWCC_COURSES = [
  "Graduate Diploma of Early Childhood",
  "Graduate Diploma of Early Childhood with Master of Teaching",
  "Master of Teaching (Early Childhood)",
]

const COURSES = [
  "Bachelor of Aviation (Flight)",
  "Bachelor of Aviation (Management)",
  "Bachelor of Business (3 Years)",
  "Bachelor of Business – Hospitality Management Specialisation (3 Years)",
  "Bachelor of Information Systems (3 Years)",
  "Diploma of Business Management with Bachelor of Business (3 Years)",
  "Single Unit Study – Undergraduate",
  "Graduate Diploma in Business with MBA with MPA (2 Years)",
  "Graduate Diploma of Early Childhood",
  "Graduate Diploma of Early Childhood with Master of Teaching",
  "Master of Business Administration (1.5 Years)",
  "Master of Business Administration Professional (2 Years)",
  "Master of Business Administration with Master of Professional Accounting (2 Years)",
  "Master of Information Systems (2 Years)",
  "Master of Professional Accounting (1.5 Years)",
  "Master of Professional Accounting with Master of Business Administration (2 Years)",
  "Master of Teaching (Early Childhood)",
  "Single Unit Study – Postgraduate",
  "Master of Business Administration Professional - Health Care Management (2 Years)",
  "Master of Business Administration Professional - Project management (2 Years)",
]

const CAMPUSES = ["Melbourne", "Sydney", "Brisbane", "Gold Coast"]

const ALL_INTAKES = [
  { value: "July_2026_20_07_2026",     label: "July 2026",     date: new Date("2026-07-20") },
  { value: "September 2026",           label: "September 2026", date: new Date("2026-09-07") },
  { value: "November_2026_09_11_2026", label: "November 2026", date: new Date("2026-11-09") },
]
const INTAKES = ALL_INTAKES.filter(i => i.date >= new Date())

const ENGLISH_TESTS = [
  { value: "IELTS", label: "IELTS" },
  { value: "PTE", label: "PTE (Pearson Test of English)" },
  { value: "TOEFL", label: "TOEFL" },
  { value: "Cambridge_English_qualification", label: "Cambridge English Qualification" },
  { value: "Australian_Studies_High_School_Diploma_Above", label: "Australian High School / Diploma or Higher" },
  { value: "Holmes_Pass_Rate_50", label: "50% Pass Rate (Recent Semester)" },
  { value: "English_Placement_Test_Request", label: "Request English Placement Test" },
]

const RESIDENCY_STATUSES = [
  { value: "Australian Citizen",                                                      label: "Australian Citizen" },
  { value: "New Zealand Citizen",                                                     label: "New Zealand Citizen" },
  { value: "Humanitarian Visa",                                                       label: "Humanitarian Visa" },
  { value: "Permanent Visa",                                                          label: "Permanent Visa" },
  { value: "Currently have an international student Visa",                            label: "Currently have an international student Visa" },
  { value: "Currently have a non-student temporary Visa (Work, Tourist, or Spouse Visa)", label: "Currently have a non-student temporary Visa (Work, Tourist, or Spouse Visa)" },
  { value: "None - Currently residing outside Australia",                             label: "None - Currently residing outside Australia" },
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
        <select name={name} value={value} onChange={e => onChange(e.target.value)} required={required}
          className="w-full appearance-none px-3 py-2.5 pr-8 border border-stone-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500">
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
    <input type={type} name={name} value={value} placeholder={placeholder}
      onChange={e => onChange?.(e.target.value)} required={required} readOnly={readOnly}
      className={`w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 ${readOnly ? "bg-stone-50 text-gray-500" : "bg-white"}`} />
  </div>
)

const Section = ({ title }: { title: string }) => (
  <div className="col-span-full mt-2">
    <h3 className="text-sm font-semibold text-red-800 border-b border-red-100 pb-1">{title}</h3>
  </div>
)

// ── Address Autocomplete (Nominatim) ──────────────────────────────────────────
interface AddressResult {
  display: string
  street: string
  suburb: string
  state: string
  postcode: string
  country: string
}

const STATE_ABBR: Record<string, string> = {
  "New South Wales": "NSW", "Victoria": "VIC", "Queensland": "QLD",
  "South Australia": "SA", "Western Australia": "WA", "Tasmania": "TAS",
  "Northern Territory": "NT", "Australian Capital Territory": "ACT"
}

function AddressSearch({ streetValue, suburbValue, onStreetChange, onSuburbChange, onSelect, required }: {
  streetValue: string
  suburbValue: string
  onStreetChange: (v: string) => void
  onSuburbChange: (v: string) => void
  onSelect: (r: AddressResult) => void
  required?: boolean
}) {
  const [streetResults, setStreetResults] = useState<AddressResult[]>([])
  const [suburbResults, setSuburbResults] = useState<{ suburb: string; state: string; postcode: string }[]>([])
  const [streetOpen, setStreetOpen] = useState(false)
  const [suburbOpen, setSuburbOpen] = useState(false)
  const [streetLoading, setStreetLoading] = useState(false)
  const [suburbLoading, setSuburbLoading] = useState(false)
  const streetTimer = useRef<ReturnType<typeof setTimeout>>()
  const suburbTimer = useRef<ReturnType<typeof setTimeout>>()
  const streetRef = useRef<HTMLDivElement>(null)
  const suburbRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (streetRef.current && !streetRef.current.contains(e.target as Node)) setStreetOpen(false)
      if (suburbRef.current && !suburbRef.current.contains(e.target as Node)) setSuburbOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const searchStreet = useCallback((q: string) => {
    clearTimeout(streetTimer.current)
    if (q.length < 4) { setStreetResults([]); setStreetOpen(false); return }
    streetTimer.current = setTimeout(async () => {
      setStreetLoading(true)
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + " Australia")}&countrycodes=au&format=json&addressdetails=1&limit=6`
        const res = await fetch(url, { headers: { "Accept-Language": "en" } })
        const data = await res.json()
        const seen = new Set<string>()
        const mapped: AddressResult[] = []
        for (const item of data) {
          const addr = item.address || {}
          const houseNumber = addr.house_number || ""
          const road = addr.road || addr.pedestrian || addr.footway || ""
          const street = [houseNumber, road].filter(Boolean).join(" ")
          const suburb = addr.suburb || addr.town || addr.village || addr.city_district || addr.city || addr.municipality || ""
          const state = STATE_ABBR[addr.state || ""] || addr.state || ""
          const postcode = addr.postcode || ""
          const country = addr.country_code?.toUpperCase() === "AU" ? "Australia" : addr.country || ""
          const display = item.display_name || ""
          if (!road || seen.has(display)) continue
          seen.add(display)
          mapped.push({ display, street, suburb, state, postcode, country })
        }
        setStreetResults(mapped)
        setStreetOpen(mapped.length > 0)
      } catch { setStreetResults([]) }
      finally { setStreetLoading(false) }
    }, 400)
  }, [])

  const searchSuburb = useCallback((q: string) => {
    clearTimeout(suburbTimer.current)
    if (q.length < 2) { setSuburbResults([]); setSuburbOpen(false); return }
    suburbTimer.current = setTimeout(async () => {
      setSuburbLoading(true)
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + " Australia")}&countrycodes=au&featuretype=city&format=json&addressdetails=1&limit=8`
        const res = await fetch(url, { headers: { "Accept-Language": "en" } })
        const data = await res.json()
        const seen = new Set<string>()
        const mapped: { suburb: string; state: string; postcode: string }[] = []
        for (const item of data) {
          const addr = item.address || {}
          const suburb = addr.suburb || addr.town || addr.village || addr.city_district || addr.city || addr.municipality || ""
          const state = STATE_ABBR[addr.state || ""] || addr.state || ""
          const postcode = addr.postcode || ""
          if (!suburb || seen.has(suburb + postcode)) continue
          seen.add(suburb + postcode)
          mapped.push({ suburb, state, postcode })
        }
        setSuburbResults(mapped)
        setSuburbOpen(mapped.length > 0)
      } catch { setSuburbResults([]) }
      finally { setSuburbLoading(false) }
    }, 350)
  }, [])

  return (
    <>
      {/* Street Address */}
      <div ref={streetRef} className="col-span-full relative">
        <label className="block text-xs font-medium text-gray-600 mb-1">Street Address{required && <span className="text-red-500 ml-0.5">*</span>}</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input type="text" value={streetValue} required={required}
            onChange={e => { onStreetChange(e.target.value); searchStreet(e.target.value) }}
            onFocus={() => streetResults.length > 0 && setStreetOpen(true)}
            placeholder="Start typing your street address…"
            className="w-full pl-9 pr-4 py-2.5 border border-stone-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
          />
          {streetLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />}
        </div>
        {streetOpen && streetResults.length > 0 && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden">
            {streetResults.map((r, i) => (
              <button key={i} type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  onSelect(r)
                  onStreetChange(r.street || streetValue)
                  onSuburbChange(r.suburb)
                  setStreetOpen(false)
                }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-red-50 border-b border-stone-100 last:border-0">
                <p className="font-medium text-gray-800 truncate">{r.street || r.display}</p>
                <p className="text-xs text-gray-400 truncate">{r.suburb} {r.state} {r.postcode}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* City / Suburb */}
      <div ref={suburbRef} className="col-span-full relative">
        <label className="block text-xs font-medium text-gray-600 mb-1">City / Suburb{required && <span className="text-red-500 ml-0.5">*</span>}</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input type="text" value={suburbValue} required={required}
            onChange={e => { onSuburbChange(e.target.value); searchSuburb(e.target.value) }}
            onFocus={() => suburbResults.length > 0 && setSuburbOpen(true)}
            placeholder="Type suburb name…"
            className="w-full pl-9 pr-4 py-2.5 border border-stone-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
          />
          {suburbLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />}
        </div>
        {suburbOpen && suburbResults.length > 0 && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden">
            {suburbResults.map((r, i) => (
              <button key={i} type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  onSuburbChange(r.suburb)
                  onSelect({ display: r.suburb, street: streetValue, suburb: r.suburb, state: r.state, postcode: r.postcode, country: "Australia" })
                  setSuburbOpen(false)
                }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-red-50 flex items-center justify-between gap-4 border-b border-stone-100 last:border-0">
                <span className="font-medium text-gray-800">{r.suburb}</span>
                <span className="text-xs text-gray-400 flex-shrink-0">{r.state} {r.postcode}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ── Post-submission file uploader ─────────────────────────────────────────────
function FileUploaderPost({ dealId }: { dealId: string }) {
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
      <div onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => ref.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${dragging ? "border-red-400 bg-red-50" : "border-stone-200 hover:border-red-300 hover:bg-stone-50"}`}>
        <input ref={ref} type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
        <Paperclip className={`h-8 w-8 mx-auto mb-2 ${dragging ? "text-red-500" : "text-stone-300"}`} />
        {uploading ? <p className="text-sm text-gray-500 animate-pulse">Uploading…</p> : (
          <><p className="text-sm font-medium text-gray-600">Drag and drop files here</p>
            <p className="text-xs text-gray-400 mt-1">or click to browse · PDF, JPG, PNG recommended · max 10 files</p></>
        )}
      </div>
      {msg && <p className={`text-xs mt-2 text-center ${msg.startsWith("✅") ? "text-emerald-600" : "text-red-600"}`}>{msg}</p>}
    </div>
  )
}

// ── Pre-submission file uploader ──────────────────────────────────────────────
const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png"]
const MAX_SIZE_MB = 5
interface UploadedFile { fileId: string; fileName: string; extension: string; size: number }

function PreSubmitUploader({ files, onChange, disabled }: {
  files: UploadedFile[]; onChange: (f: UploadedFile[]) => void; disabled?: boolean
}) {
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [err, setErr] = useState("")
  const ref = useRef<HTMLInputElement>(null)

  const handleFiles = async (list: FileList | null) => {
    if (!list || uploading || disabled) return
    if (files.length >= 10) { setErr("Maximum 10 files reached."); return }
    setErr("")
    const toAdd = Array.from(list).slice(0, 10 - files.length)
    const results: UploadedFile[] = []
    setUploading(true)
    for (const file of toAdd) {
      const ext = file.name.split(".").pop()?.toLowerCase() || ""
      if (!ALLOWED_EXT.includes(ext)) { setErr(`${file.name}: .${ext} not allowed.`); continue }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) { setErr(`${file.name} exceeds ${MAX_SIZE_MB}MB.`); continue }
      try {
        const res = await fetch("/.netlify/functions/upload-temp", {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name), "X-File-Size": String(file.size) },
          body: file,
        })
        const data = await res.json()
        if (!res.ok || !data.ok) { setErr(data.error || `Failed to upload ${file.name}`); continue }
        results.push({ fileId: data.fileId, fileName: data.fileName, extension: data.extension, size: data.size })
      } catch { setErr(`Failed to upload ${file.name}`) }
    }
    onChange([...files, ...results])
    setUploading(false)
  }

  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
              <Paperclip className="h-3.5 w-3.5 text-stone-400 flex-shrink-0" />
              <span className="text-xs text-gray-700 flex-1 truncate">{f.fileName}</span>
              <span className="text-xs text-gray-400">{(f.size / 1024).toFixed(0)}KB</span>
              {!disabled && <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="text-stone-300 hover:text-red-500 transition-colors ml-1">✕</button>}
            </div>
          ))}
        </div>
      )}
      {files.length < 10 && !disabled && (
        <div onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
          onClick={() => ref.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${dragging ? "border-red-400 bg-red-50" : "border-stone-200 hover:border-red-300 hover:bg-stone-50"}`}>
          <input ref={ref} type="file" multiple accept={ALLOWED_EXT.map(e => "." + e).join(",")} className="hidden"
            onChange={e => { handleFiles(e.target.files); e.target.value = "" }} />
          <Paperclip className={`h-7 w-7 mx-auto mb-2 ${dragging ? "text-red-500" : "text-stone-300"}`} />
          {uploading
            ? <p className="text-sm text-gray-500 animate-pulse">Uploading…</p>
            : <><p className="text-sm font-medium text-gray-600">Drag and drop files here</p>
                <p className="text-xs text-gray-400 mt-1">or click to browse · PDF, JPG, JPEG, PNG only · max 5MB each · {10 - files.length} slot{10 - files.length !== 1 ? "s" : ""} remaining</p></>
          }
        </div>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}

// ── Main Form ──────────────────────────────────────────────────────────────────
export default function ApplicationForm({ mode, sessionToken, prefillEmail, prefillName, onSuccess }: Props) {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [dealId, setDealId] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [passportWarning, setPassportWarning] = useState<{ studentName: string; status: string; applicationUrl: string } | null>(null)
  const [corWarning, setCorWarning] = useState(false)
  const [passportChecking, setPassportChecking] = useState(false)
  const passportTimer = useRef<ReturnType<typeof setTimeout>>()

  const nameParts = (prefillName || "").split(" ")
  const [f, setF] = useState({
    firstname: mode === "student" ? nameParts[0] || "" : "",
    lastname: mode === "student" ? nameParts.slice(1).join(" ") : "",
    student_email: mode === "student" ? prefillEmail : "",
    mobile_phone_number: "",
    date_of_birth: "",
    street_name: "",
    city: "",
    state: "",
    post_code: "",
    country: "",
    nationality: "",
    usi_number: "",
    passport_number: "",
    residency_status: "",
    where_are_you_applying_from: "",
    disability: "",
    course_name_australia: "",
    campus_australia: "",
    intake_australia: "",
    advanced_standing: "",
    oshc: "",
    wwcc_blue_card_number: "",
    placement_type: "",
    name_of_qualification: "",
    name_of_institution_attended: "",
    name_of_english_proficiency_test_australia: "",
    what_are_the_results_of_your_english_proficiency_test_: "",
    what_date_did_you_take_your_english_proficiency_test_: "",
    ohc_english: "",
    ohcweeks: "",
    do_you_intend_to_apply_for_fee_help_: "",
  })

  const set = (k: string) => (v: string) => setF(prev => ({ ...prev, [k]: v }))

  // ── Derived logic flags ───────────────────────────────────────────────────
  const showWWCC = WWCC_COURSES.includes(f.course_name_australia)
  const showPlacementType = WWCC_COURSES.includes(f.course_name_australia)
  const showOHCWeeks = f.ohc_english === "Yes"

  const englishTest = f.name_of_english_proficiency_test_australia
  const hideResults = englishTest === "Australian_Studies_High_School_Diploma_Above"
                   || englishTest === "Holmes_Pass_Rate_50"
                   || englishTest === "English_Placement_Test_Request"
  const hideDate    = englishTest === "English_Placement_Test_Request"
  const resultsRequired = !hideResults && englishTest !== "" && englishTest !== "English_Placement_Test_Request"
  const dateRequired    = !hideDate && englishTest !== "" && englishTest !== "English_Placement_Test_Request"

  // ── Passport duplicate check ─────────────────────────────────────────────
  const checkPassportDuplicate = useCallback(async (passportValue: string) => {
    clearTimeout(passportTimer.current)
    if (passportValue.length < 6) { setPassportWarning(null); return }
    passportTimer.current = setTimeout(async () => {
      setPassportChecking(true)
      try {
        // Get companyId from session
        const token = sessionStorage.getItem("holmes_session_token")
        let companyId: string | null = null
        if (token) {
          try {
            const payload = JSON.parse(atob(token.split(".")[1]))
            companyId = payload.companyId || null
          } catch {}
        }
        if (!companyId && mode !== "agent") { setPassportChecking(false); return }
        const res = await fetch("/.netlify/functions/check-duplicate-passport", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passport: passportValue, agentCompanyId: companyId }),
        })
        const data = await res.json()
        if (data.duplicate && data.sameCompany) {
          setPassportWarning({ studentName: data.studentName, status: data.status, applicationUrl: data.applicationUrl })
          setCorWarning(false)
        } else if (data.duplicate && data.type === "different_agency") {
          setCorWarning(true)
          setPassportWarning(null)
        } else {
          setPassportWarning(null)
          setCorWarning(false)
        }
      } catch { setPassportWarning(null) }
      finally { setPassportChecking(false) }
    }, 600)
  }, [mode])

  const handleAddressSelect = (r: { display: string; street: string; suburb: string; state: string; postcode: string; country: string }) => {
    setF(prev => ({
      ...prev,
      street_name: r.street || prev.street_name,
      city: r.suburb || prev.city,
      state: r.state || prev.state,
      post_code: r.postcode || prev.post_code,
      country: r.country || "Australia",
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true); setError("")
    try {
      // Submit-time duplicate check
      if (mode === "agent" && f.passport_number.length >= 6) {
        const token = sessionStorage.getItem("holmes_session_token")
        let companyId: string | null = null
        if (token) {
          try { const p = JSON.parse(atob(token.split(".")[1])); companyId = p.companyId || null } catch {}
        }
        if (companyId) {
          const dupRes = await fetch("/.netlify/functions/check-duplicate-passport", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ passport: f.passport_number, agentCompanyId: companyId }),
          })
          const dupData = await dupRes.json()
          if (dupData.duplicate && dupData.sameCompany) {
            setPassportWarning({ studentName: dupData.studentName, status: dupData.status, applicationUrl: dupData.applicationUrl })
            setError("A duplicate application exists for this passport number. Please review the warning above.")
            setSubmitting(false)
            return
          }
        }
      }
      const res = await fetch("/.netlify/functions/submit-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, ...f, uploadedFiles }),
      })
      const data = await res.json()
      if (res.status === 409 && data.duplicate && data.sameCompany) {
        // Same-company passport duplicate — show warning, block submission
        setPassportWarning({ studentName: data.studentName, status: "", applicationUrl: data.applicationUrl })
        setError("A duplicate application exists for this passport number. Please review the warning above.")
        setSubmitting(false)
        return
      }
      if (res.status === 409 && data.dealId && !data.duplicate) {
        // Student already has a deal
        window.location.href = mode === "agent" ? `/applications/${data.dealId}` : `/student/application/${data.dealId}`
        return
      }
      if (!res.ok || !data.ok) {
        setError(data.error || "Submission failed. Please try again.")
        setSubmitting(false)
        return
      }
      onSuccess?.(data.dealId)
      window.location.href = mode === "agent" ? `/applications/${data.dealId}?tab=documents` : `/student/application/${data.dealId}?tab=documents`
    } catch {
      setError("Something went wrong. Please try again.")
      setSubmitting(false)
    }
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (dealId) {
    return (
      <div className="text-center py-8 px-4">
        <div className="text-left max-w-lg mx-auto mb-6">
          <p className="text-xs font-semibold text-gray-600 mb-2">Upload Supporting Documents</p>
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            For best results upload PDF, JPG, JPEG or PNG. Avoid uploading more than 10 files.
          </div>
          <FileUploaderPost dealId={dealId} />
        </div>
        <button onClick={() => mode === "agent" ? navigate(`/applications/${dealId}`) : navigate(`/student/application/${dealId}`)}
          className="px-6 py-2.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-sm font-medium transition-colors">
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
        {mode === "agent" && <Inp label="Agent Email" name="agent_email" value={prefillEmail} readOnly type="email" />}
        <Inp label="Mobile Phone Number" name="mobile_phone_number" value={f.mobile_phone_number} onChange={set("mobile_phone_number")} required placeholder="+61 4XX XXX XXX" />
        <Inp label="Date of Birth" name="date_of_birth" value={f.date_of_birth} onChange={set("date_of_birth")} required type="date" />

        {/* ── Address ── */}
        <Section title="Address" />
        <AddressSearch
          streetValue={f.street_name}
          suburbValue={f.city}
          onStreetChange={set("street_name")}
          onSuburbChange={set("city")}
          onSelect={handleAddressSelect}
          required
        />
        <Inp label="State" name="state" value={f.state} onChange={set("state")} required placeholder="VIC" />
        <Inp label="Postcode" name="post_code" value={f.post_code} onChange={set("post_code")} required placeholder="3000" />
        <div className="col-span-full">
          <Inp label="Country" name="country" value={f.country} onChange={set("country")} required placeholder="Australia" />
        </div>

        {/* ── Identity ── */}
        <Section title="Identity" />
        <Sel label="Nationality" name="nationality" value={f.nationality} onChange={set("nationality")} options={NATIONALITIES} required />
        <div className="col-span-full sm:col-span-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">Passport Number<span className="text-red-500 ml-0.5">*</span></label>
          <div className="relative">
            <input type="text" name="passport_number" value={f.passport_number} required placeholder="Passport number"
              onChange={e => { set("passport_number")(e.target.value); if (mode === "agent") checkPassportDuplicate(e.target.value) }}
              className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500" />
            {passportChecking && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />}
          </div>
          {passportWarning && (
            <div className="mt-2 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 text-xs text-amber-800">
              <p className="font-semibold mb-1">⚠️ This applicant appears to have already been submitted by your agency.</p>
              <p className="mb-2">Please do not create a duplicate application. Open the existing case and add a comment if an amendment or update is required.</p>
              <a href={passportWarning.applicationUrl}
                className="inline-flex items-center gap-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg px-3 py-1.5 font-medium transition-colors"
              >
                View existing application →
              </a>
              <p className="mt-2 text-amber-600">Existing application: <strong>{passportWarning.studentName}</strong> · {passportWarning.status}</p>
            </div>
          )}
          {corWarning && (
            <div className="mt-2 bg-blue-50 border border-blue-300 rounded-xl px-4 py-3 text-xs text-blue-800">
              <p className="font-semibold mb-1">ℹ️ Previous application detected</p>
              <p>This passport number appears to be linked to an application submitted through another agency.</p>
              <p className="mt-1">Please upload a <strong>Change of Representation letter</strong> with this application to avoid processing delays.</p>
            </div>
          )}
        </div>
        <Sel label="Residency Status" name="residency_status" value={f.residency_status} onChange={set("residency_status")} options={RESIDENCY_STATUSES} required />
        <Sel label="Where are you applying from?" name="where_are_you_applying_from" value={f.where_are_you_applying_from} onChange={set("where_are_you_applying_from")} options={[{ value: "Onshore", label: "Onshore" }, { value: "Offshore", label: "Offshore" }]} required />
        <Inp label="USI Number" name="usi_number" value={f.usi_number} onChange={set("usi_number")} placeholder="10-character alphanumeric (e.g. AB12CD34EF)" />
        <Sel label="Do you have a disability or long-term medical condition?" name="disability" value={f.disability} onChange={set("disability")} options={YES_NO} />

        {/* ── Course Details ── */}
        <Section title="Course Details" />
        <div className="col-span-full">
          <Sel label="Course Name (Australia)" name="course_name_australia" value={f.course_name_australia} onChange={set("course_name_australia")} options={COURSES} required />
        </div>
        <Sel label="Campus (Australia)" name="campus_australia" value={f.campus_australia} onChange={set("campus_australia")} options={CAMPUSES} required />
        <Sel label="Intake (Australia)" name="intake_australia" value={f.intake_australia} onChange={set("intake_australia")} options={INTAKES} required />
        <Sel label="Advanced Standing" name="advanced_standing" value={f.advanced_standing} onChange={set("advanced_standing")} options={YES_NO} required />
        <Sel label="Do you require OSHC from us?" name="oshc" value={f.oshc} onChange={set("oshc")} options={YES_NO} />
        {showWWCC && (
          <div className="col-span-full">
            <Inp label="WWCC / Blue Card Number" name="wwcc_blue_card_number" value={f.wwcc_blue_card_number} onChange={set("wwcc_blue_card_number")} required placeholder="Card number" />
          </div>
        )}
        {showPlacementType && (
          <div className="col-span-full">
            <Sel label="Placement Type" name="placement_type" value={f.placement_type} onChange={set("placement_type")} required options={[
              { value: "Holmes_Institute_Placement", label: "Holmes Institute Placement" },
              { value: "Self-Placement_Only_for_Early_Childhood_Teaching_Applicant", label: "Self-Placement (Only for Early Childhood/Teaching Applicant)" },
            ]} />
          </div>
        )}

        {/* ── Prior Education ── */}
        <Section title="Prior Education" />
        <Inp label="Name of Qualification" name="name_of_qualification" value={f.name_of_qualification} onChange={set("name_of_qualification")} required placeholder="e.g. Bachelor of Science" />
        <Inp label="Name of Institution Attended" name="name_of_institution_attended" value={f.name_of_institution_attended} onChange={set("name_of_institution_attended")} required placeholder="e.g. University of Melbourne" />

        {/* ── English Proficiency ── */}
        <Section title="English Proficiency" />
        <Sel label="English Proficiency Test" name="name_of_english_proficiency_test_australia" value={f.name_of_english_proficiency_test_australia} onChange={set("name_of_english_proficiency_test_australia")} options={ENGLISH_TESTS} required />
        {!hideResults && (
          <Inp label="Results of English Proficiency Test" name="what_are_the_results_of_your_english_proficiency_test_" value={f.what_are_the_results_of_your_english_proficiency_test_} onChange={set("what_are_the_results_of_your_english_proficiency_test_")} required={resultsRequired} placeholder="e.g. Overall 6.5, Writing 6.0" />
        )}
        {!hideDate && (
          <Inp label="English Test Date" name="what_date_did_you_take_your_english_proficiency_test_" value={f.what_date_did_you_take_your_english_proficiency_test_} onChange={set("what_date_did_you_take_your_english_proficiency_test_")} required={dateRequired} type="date" />
        )}
        <div className="col-span-full">
          <Sel label="Do you require English course prior to starting?" name="ohc_english" value={f.ohc_english} onChange={set("ohc_english")} options={YES_NO} />
        </div>
        {showOHCWeeks && (
          <Inp label="OHC Weeks" name="ohcweeks" value={f.ohcweeks} onChange={set("ohcweeks")} placeholder="e.g. 10" />
        )}

        {/* ── Additional Information ── */}
        <Section title="Additional Information" />
        <Sel label="Do you intend to apply for FEE HELP?" name="do_you_intend_to_apply_for_fee_help_" value={f.do_you_intend_to_apply_for_fee_help_} onChange={set("do_you_intend_to_apply_for_fee_help_")} options={YES_NO} />

      </div>

      {/* ── Document Upload ── */}
      <div className="mt-2">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-px bg-stone-200" />
          <span className="text-xs text-stone-400 uppercase tracking-wider">Supporting Documents</span>
          <div className="flex-1 h-px bg-stone-200" />
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-3 text-xs text-amber-800 leading-relaxed">
          <p className="font-semibold mb-1">⚠️ Important</p>
          <p>Only PDF, JPG, JPEG and PNG files are supported.</p>
          <p>Maximum file size is 5 MB per file.</p>
          <p className="mt-1 text-amber-700">Files larger than 5 MB or unsupported file types cannot be uploaded. For the best experience, please upload documents as PDF and images as JPG or PNG.</p>
        </div>
        <PreSubmitUploader files={uploadedFiles} onChange={setUploadedFiles} disabled={submitting} />
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}

      <button type="submit" disabled={submitting}
        className="w-full py-3 bg-red-700 hover:bg-red-800 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
        {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</> : "Submit Application"}
      </button>
    </form>
  )
}
