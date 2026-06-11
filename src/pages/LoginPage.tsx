import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2, CheckCircle, Mail, ArrowRight, AlertCircle, XCircle, X, Eye, EyeOff, Lock, Building2, GraduationCap } from "lucide-react"
import { AuroraBackground, HOLMES_AURORA_COLORS } from "../components/AuroraBackground"
import { useAuth, isHolmesStaff } from "../lib/auth"
import { fetchAgentByEmail, fetchDealsByCompanyId } from "../lib/hubspot"

type Status = "idle" | "loading" | "success" | "not_found" | "error"

// ── Demo direct students ──────────────────────────────────────────────────────
const MARKETERS = [
  { name: "Indra Adhikari",   title: "Victoria Representative",        email: "iadhikari@holmes.edu.au" },
  { name: "Dinesh Chetwani",  title: "Queensland Representative",       email: "dchetwani@holmes.edu.au" },
  { name: "Don Kauffman",     title: "New South Wales Representative",  email: "dkauffman@holmes.edu.au" },
]

const DEMO_PASSWORD = import.meta.env.VITE_PORTAL_PASSWORD

export default function LoginPage() {
  const navigate = useNavigate()
  const { user, login } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<Status>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  const directDealRef = React.useRef<string | null>(null)

  useEffect(() => {
    if (user) {
      if (directDealRef.current) {
        const dealId = directDealRef.current
        directDealRef.current = null
        navigate(`/applications/${dealId}`)
      } else {
        navigate("/")
      }
    }
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus("loading")
    setErrorMessage(null)

    try {
      const cleanEmail = email.trim().toLowerCase()

      if (password !== DEMO_PASSWORD) {
        setStatus("error")
        setErrorMessage("Incorrect password. Please try again.")
        return
      }

      let name = cleanEmail.split("@")[0]
      let fullName = name
      let companyName = isHolmesStaff(cleanEmail) ? "Holmes Institute Australia" : ""

      if (!isHolmesStaff(cleanEmail)) {
        try {
          // Step 1: find contact by email
          const contactRes = await fetch(`/.netlify/functions/hubspot?path=${encodeURIComponent("/crm/v3/objects/contacts/search")}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: cleanEmail }] }],
              properties: ["email", "firstname", "lastname"],
              limit: 1,
            })
          })
          const contactData = await contactRes.json()
          const contact = contactData.results?.[0]

          if (!contact) {
            // Not found in HubSpot at all
            setStatus("error")
            setErrorMessage("No account found for this email. Please contact your Holmes representative.")
            return
          }

          const fn = contact.properties?.firstname || ""
          const ln = contact.properties?.lastname || ""
          fullName = `${fn} ${ln}`.trim() || name
          name = fn || name

          // Step 2: get company association
          const companyAssocRes = await fetch(`/.netlify/functions/hubspot?path=${encodeURIComponent(`/crm/v4/objects/contacts/${contact.id}/associations/companies`)}`)
          const companyAssocData = await companyAssocRes.json()
          const companyId = companyAssocData.results?.[0]?.toObjectId

          if (companyId) {
            // Has company — regular agent
            const companyRes = await fetch(`/.netlify/functions/hubspot?path=${encodeURIComponent(`/crm/v3/objects/companies/${companyId}?properties=name,agent_email,contact_person_name`)}`)
            const companyData = await companyRes.json()
            companyName = companyData.properties?.name || ""
            const contactPerson = companyData.properties?.contact_person_name || ""
            if (contactPerson) { fullName = contactPerson; name = contactPerson.split(" ")[0] }
            sessionStorage.setItem("holmes_company_id", String(companyId))
          } else {
            // No company — Direct Student
            const dealAssocRes = await fetch(`/.netlify/functions/hubspot?path=${encodeURIComponent(`/crm/v4/objects/contacts/${contact.id}/associations/deals`)}`)
            const dealAssocData = await dealAssocRes.json()
            const dealId = dealAssocData.results?.[0]?.toObjectId
            if (dealId) {
              directDealRef.current = String(dealId)
              companyName = "Direct Student"
            } else {
              setStatus("error")
              setErrorMessage("No applications found for this email. Please contact your Holmes representative.")
              return
            }
          }
        } catch {
          setStatus("error")
          setErrorMessage("Something went wrong. Please try again.")
          return
        }
      }

      login({ id: "demo", name, fullName, email: cleanEmail, companyName })
      setStatus("success")
    } catch {
      setStatus("error")
      setErrorMessage("Something went wrong. Please try again.")
    }
  }

  const reset = () => { setStatus("idle"); setEmail(""); setPassword(""); setErrorMessage(null) }
  const primaryColor = "#991b1b"

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-stone-950">
      <AuroraBackground colorStops={HOLMES_AURORA_COLORS} speed={0.6} amplitude={1.2} blend={0.6} />

      {/* Logo top-left */}
      <div className="absolute top-6 left-8 z-10">
        <div className="flex items-center gap-2.5">
          <img
            src="https://holmes.edu.au/templates/images/Logo-base-banner.png"
            alt="Holmes Institute Australia"
            className="h-8 w-auto"
            onError={(e) => { e.currentTarget.style.display = "none" }}
          />
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-white text-sm font-bold leading-none">Holmes Institute Australia</span>
            <span className="text-red-200 text-xs leading-none mt-0.5">Admissions Portal</span>
          </div>
        </div>
      </div>

      <div className="w-full max-w-sm relative z-10 page-fade-in">
        <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
          <div className="p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-800">Welcome</h2>
              <p className="mt-1 text-sm text-gray-500">How would you like to sign in?</p>
            </div>

            {/* Two buttons */}
            <div className="space-y-3">
              <button
                onClick={() => navigate("/agent-login")}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-stone-200 hover:border-red-300 hover:bg-red-50 transition-colors group text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-red-700 flex items-center justify-center flex-shrink-0 group-hover:bg-red-800 transition-colors">
                  <Building2 className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 group-hover:text-red-700 transition-colors">Agent / Staff</p>
                  <p className="text-xs text-gray-500 mt-0.5">Manage your student applications</p>
                </div>
                <ArrowRight className="h-5 w-5 text-stone-300 group-hover:text-red-500 transition-colors flex-shrink-0" />
              </button>

              <button
                onClick={() => navigate("/student")}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-stone-200 hover:border-red-300 hover:bg-red-50 transition-colors group text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-stone-700 flex items-center justify-center flex-shrink-0 group-hover:bg-red-800 transition-colors">
                  <GraduationCap className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 group-hover:text-red-700 transition-colors">Direct Student</p>
                  <p className="text-xs text-gray-500 mt-0.5">Track or submit your student application</p>
                </div>
                <ArrowRight className="h-5 w-5 text-stone-300 group-hover:text-red-500 transition-colors flex-shrink-0" />
              </button>
            </div>

            {/* Contact */}
            <p className="mt-6 text-center text-xs text-gray-400">
              Need help?{" "}
              <button
                onClick={() => setShowModal(true)}
                className="text-red-600 hover:text-red-700 underline underline-offset-2 font-medium transition-colors"
              >
                Contact your Holmes representative
              </button>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-3 text-center text-xs text-white/40">
          © {new Date().getFullYear()} Holmes Institute Australia. All rights reserved.
        </p>
      </div>

      {/* Contact Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Contact Your Holmes Representative</h2>
                <p className="text-sm text-gray-500 mt-0.5">Click an email to open in your mail app</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-stone-400 hover:text-stone-600 p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {MARKETERS.map(m => (
                <a
                  key={m.email}
                  href={`mailto:${m.email}`}
                  className="flex items-center gap-4 p-4 rounded-xl border border-stone-100 hover:border-red-200 hover:bg-red-50 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-700 font-bold text-sm flex-shrink-0">
                    {m.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 group-hover:text-red-700 transition-colors">{m.name}</p>
                    <p className="text-xs text-gray-500">{m.title}</p>
                    <p className="text-xs text-red-600 mt-0.5">{m.email}</p>
                  </div>
                  <span className="text-lg">✉️</span>
                </a>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-stone-100">
              <button onClick={() => setShowModal(false)} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
