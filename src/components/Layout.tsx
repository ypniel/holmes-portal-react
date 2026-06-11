import React from "react"
import { useNavigate } from "react-router-dom"
import { Header } from "./Header"

export function Footer() {
  const navigate = useNavigate()
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-500">© 2026 Holmes Institute Australia. All rights reserved.</p>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <button onClick={() => navigate("/")} className="hover:text-red-600 transition-colors">Privacy</button>
            <button onClick={() => navigate("/")} className="hover:text-red-600 transition-colors">Terms</button>
            <a href="mailto:admissions@holmes.edu.au" className="hover:text-red-600 transition-colors">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  )
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />
      <main className="flex-1 pb-12">{children}</main>
      <Footer />
    </div>
  )
}

export function PageContainer({
  children,
  fullBleed = false,
  className = "",
}: {
  children: React.ReactNode
  fullBleed?: boolean
  className?: string
}) {
  if (fullBleed) {
    return <div className={`pt-16 page-fade-in ${className}`}>{children}</div>
  }
  return (
    <div className={`pt-20 pb-8 max-w-7xl mx-auto px-4 md:px-6 page-fade-in ${className}`}>
      {children}
    </div>
  )
}
