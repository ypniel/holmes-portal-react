import React from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider, useAuth } from "./lib/auth"
import { Layout } from "./components/Layout"
import LoginPage from "./pages/LoginPage"
import HomePage from "./pages/HomePage"
import ApplicationsPage from "./pages/ApplicationsPage"
import ApplicationDetailPage from "./pages/ApplicationDetailPage"
import { SettingsPage, NotFoundPage } from "./pages/OtherPages"
import StudentLoginPage from "./pages/StudentLoginPage"
import StudentApplicationPage from "./pages/StudentApplicationPage"
import AgentLoginPage from "./pages/AgentLoginPage"

function SplashScreen() {
  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "#0c0a09",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: "24px",
        animation: "splashFadeOut 0.3s ease-out 0.4s forwards",
        zIndex: 9999,
      }}
    >
      <style>{`
        @keyframes splashFadeOut {
          to { opacity: 0; pointer-events: none; }
        }
        @keyframes splashPulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
      `}</style>
      <img
        src="https://holmes.edu.au/templates/images/Logo-base-banner.png"
        alt="Holmes"
        style={{
          height: "36px", width: "auto",
          animation: "splashPulse 1.2s ease-in-out infinite",
          filter: "brightness(0) invert(1)",
        }}
        onError={(e) => { e.currentTarget.style.display = "none" }}
      />
      <div style={{
        width: "32px", height: "32px",
        border: "3px solid #44403c",
        borderTopColor: "#991b1b",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <SplashScreen />
  if (!user) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/agent-login" element={user ? <Navigate to="/" replace /> : <AgentLoginPage />} />
      <Route path="/student" element={<StudentLoginPage />} />
      <Route path="/student/application/:id" element={<StudentApplicationPage />} />
      <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
      <Route path="/applications" element={<ProtectedRoute><ApplicationsPage /></ProtectedRoute>} />
      <Route path="/applications/:id" element={<ProtectedRoute><ApplicationDetailPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="*" element={<ProtectedRoute><NotFoundPage /></ProtectedRoute>} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
