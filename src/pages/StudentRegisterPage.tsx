import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Loader2, ChevronDown } from "lucide-react"

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

export default function StudentRegisterPage() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [f, setF] = useState({
    firstname: "",
    lastname: "",
    email: "",
    date_of_birth: "",
    passport_number: "",
    nationality: "",
    phone: "",
    applying_for: "Australia",
  })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError("")
    try {
      const res = await fetch("/.netlify/functions/register-student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || "Registration failed. Please try again.")
        setSubmitting(false)
        return
      }
      // Store session and navigate to apply
      sessionStorage.setItem("holmes_student", JSON.stringify({
        email: data.user.email,
        fullName: data.user.fullName,
        dealId: null,
        sessionToken: data.sessionToken,
        contactId: data.user.contactId,
      }))
      navigate("/student/apply", { replace: true })
    } catch {
      setError("Something went wrong. Please try again.")
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="bg-white border-b border-stone-200 px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
        <button onClick={() => navigate("/student")} className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3">
          <img
            src="https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/EDM%20Headers%20(1).png"
            alt="Holmes Institute Australia"
            className="h-7 w-auto"
            onError={(e) => { e.currentTarget.style.display = "none" }}
          />
          <div>
            <h1 className="text-base font-bold text-gray-800">Register as an Applicant</h1>
            <p className="text-xs text-gray-500">Holmes Institute Australia</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">First Name <span className="text-red-500">*</span></label>
                <input type="text" value={f.firstname} onChange={set("firstname")} required
                  placeholder="Given name"
                  className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Last Name</label>
                <input type="text" value={f.lastname} onChange={set("lastname")}
                  placeholder="Family name"
                  className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email <span className="text-red-500">*</span></label>
              <input type="email" value={f.email} onChange={set("email")} required
                placeholder="your@email.com"
                className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date of Birth <span className="text-red-500">*</span></label>
              <input type="date" value={f.date_of_birth} onChange={set("date_of_birth")} required
                className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Passport Number <span className="text-red-500">*</span></label>
              <input type="text" value={f.passport_number} onChange={set("passport_number")} required
                placeholder="Passport number"
                className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nationality <span className="text-red-500">*</span></label>
              <div className="relative">
                <select value={f.nationality} onChange={set("nationality")} required
                  className="w-full appearance-none px-3 py-2.5 pr-8 border border-stone-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500">
                  <option value="">Select nationality…</option>
                  {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone Number</label>
              <input type="tel" value={f.phone} onChange={set("phone")}
                placeholder="+61 4XX XXX XXX"
                className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">What country do you want to apply for?</label>
              <div className="relative">
                <select value={f.applying_for} onChange={set("applying_for")}
                  className="w-full appearance-none px-3 py-2.5 pr-8 border border-stone-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500">
                  <option value="Australia">Australia</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700">{error}</div>
            )}

            <button type="submit" disabled={submitting}
              className="w-full py-3 bg-red-700 hover:bg-red-800 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Creating account…</> : "Register & Continue"}
            </button>

            <p className="text-center text-xs text-gray-400">
              Already have an account?{" "}
              <button type="button" onClick={() => navigate("/student")} className="text-red-700 hover:underline">Sign in here</button>
            </p>

          </form>
        </div>
      </div>
    </div>
  )
}
