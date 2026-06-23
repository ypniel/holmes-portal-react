import React from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider, useAuth } from "./lib/auth"
import { Layout } from "./components/Layout"
import AdminPage from "./pages/AdminPage"
import LoginPage from "./pages/LoginPage"
import HomePage from "./pages/HomePage"
import ApplicationsPage from "./pages/ApplicationsPage"
import ApplicationDetailPage from "./pages/ApplicationDetailPage"
import NewApplicationPage from "./pages/NewApplicationPage"
import { SettingsPage, NotFoundPage } from "./pages/OtherPages"
import StudentLoginPage from "./pages/StudentLoginPage"
import StudentRegisterPage from "./pages/StudentRegisterPage"
import StudentApplicationPage from "./pages/StudentApplicationPage"
import StudentApplyPage from "./pages/StudentApplyPage"
import { NavigationProgress } from "./components/NavigationProgress"
import AgentLoginPage from "./pages/AgentLoginPage"
import StaffLoginPage from "./pages/StaffLoginPage"
import SetPasswordPage from "./pages/SetPasswordPage"

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100">
        <div className="h-8 w-8 border-4 border-stone-300 border-t-red-700 rounded-full animate-spin" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/agent/set-password" element={<SetPasswordPage />} />
      <Route path="/agent-login" element={user ? <Navigate to="/" replace /> : <AgentLoginPage />} />
      <Route path="/staff-login" element={user ? <Navigate to="/" replace /> : <StaffLoginPage />} />
      <Route path="/student" element={<StudentLoginPage />} />
      <Route path="/student/register" element={<StudentRegisterPage />} />
      <Route path="/student/apply" element={<StudentApplyPage />} />
      <Route path="/student/application/:id" element={<StudentApplicationPage />} />
      <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
      <Route path="/applications" element={<ProtectedRoute><ApplicationsPage /></ProtectedRoute>} />
      <Route path="/applications/new" element={<ProtectedRoute>{user && isHolmesStaff(user.email) ? <Navigate to="/applications" replace /> : <NewApplicationPage />}</ProtectedRoute>} />
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
        <NavigationProgress />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
