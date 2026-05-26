import React from "react"
import { useNavigate } from "react-router-dom"
import { User, Mail, LogOut, Home, ArrowLeft, FileQuestion } from "lucide-react"
import { PageContainer } from "../components/Layout"
import { useAuth } from "../lib/auth"

export function SettingsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <PageContainer>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Settings</h1>
          <p className="text-stone-500">Manage your account and preferences</p>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-100">
            <h2 className="font-semibold text-stone-900">Profile</h2>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="h-16 w-16 rounded-full bg-red-50 border-2 border-red-100 flex items-center justify-center text-red-700 text-xl font-semibold">
                {user?.fullName?.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase() || "U"}
              </div>
              <div>
                <p className="font-semibold text-stone-900 text-lg">{user?.fullName || "User"}</p>
                <p className="text-sm text-stone-500">Holmes Agent Portal</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-lg bg-stone-50">
                <User className="h-5 w-5 text-stone-400" />
                <div className="flex-1">
                  <p className="text-sm text-stone-500">Full Name</p>
                  <p className="font-medium text-stone-900">{user?.fullName || "Not set"}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 p-4 rounded-lg bg-stone-50">
                <Mail className="h-5 w-5 text-stone-400" />
                <div className="flex-1">
                  <p className="text-sm text-stone-500">Email Address</p>
                  <p className="font-medium text-stone-900">{user?.email || "Not set"}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-stone-900">Sign Out</p>
              <p className="text-sm text-stone-500">Sign out of your account</p>
            </div>
            <button
              onClick={() => { logout(); navigate("/login") }}
              className="flex items-center gap-2 px-4 py-2 text-red-600 border border-red-200 hover:bg-red-50 rounded-lg text-sm transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}

export function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <PageContainer>
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="max-w-md w-full text-center px-4">
          <div className="mb-8">
            <div className="w-24 h-24 mx-auto rounded-full bg-stone-100 flex items-center justify-center mb-6">
              <FileQuestion className="w-12 h-12 text-stone-400" />
            </div>
            <h1 className="text-6xl font-bold text-stone-200 mb-2">404</h1>
          </div>
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-stone-900 mb-2">Page not found</h2>
            <p className="text-stone-500">Sorry, we couldn't find the page you're looking for.</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 px-6 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-sm font-medium transition-colors w-full sm:w-auto"
            >
              <Home className="h-4 w-4" />
              Go to Home
            </button>
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 px-6 py-2 border border-stone-200 hover:bg-stone-50 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </button>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
