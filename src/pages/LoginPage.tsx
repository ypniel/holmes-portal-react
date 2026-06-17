import React, { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight, X, Building2, GraduationCap, Settings } from "lucide-react"
import { useAuth } from "../lib/auth"

const MARKETERS = [
  { name: "Indra Adhikari",   title: "Victoria Representative",        email: "iadhikari@holmes.edu.au" },
  { name: "Dinesh Chetwani",  title: "Queensland Representative",       email: "dchetwani@holmes.edu.au" },
  { name: "Don Kauffman",     title: "New South Wales Representative",  email: "dkauffman@holmes.edu.au" },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    if (user) navigate("/")
  }, [user])

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden animated-bg">

      {/* Logo top-left */}
      <div className="absolute top-6 left-8 z-10">
        <div className="flex items-center gap-2.5">
          <img
            src="https://39917994.fs1.hubspotusercontent-na1.net/hubfs/39917994/EDM%20Headers%20(1).png"
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

      <div className="w-full max-w-sm relative z-10">
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
                  <p className="font-bold text-gray-800 group-hover:text-red-700 transition-colors">Agent Partner</p>
                  <p className="text-xs text-gray-500 mt-0.5">Sign in to manage your applications</p>
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
        <div className="mt-2 flex justify-center">
          <a
            href="/admin"
            className="flex items-center gap-1 text-white/20 hover:text-white/50 transition-colors text-xs"
          >
            <Settings className="h-3 w-3" />
            <span>Admin</span>
          </a>
        </div>
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
