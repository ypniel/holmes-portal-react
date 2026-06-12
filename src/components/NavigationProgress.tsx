import React, { useState, useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"

export function NavigationProgress() {
  const location = useLocation()
  const [visible, setVisible] = useState(false)
  const [width, setWidth] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Clear any running timers
    if (timerRef.current) clearTimeout(timerRef.current)
    if (animRef.current) clearTimeout(animRef.current)

    // Start: show bar at 0, quickly grow to 80%
    setVisible(true)
    setWidth(0)

    // Small delay so React paints the bar at 0 first
    timerRef.current = setTimeout(() => setWidth(85), 30)

    // After short time, complete to 100% and fade out
    animRef.current = setTimeout(() => {
      setWidth(100)
      setTimeout(() => setVisible(false), 300)
    }, 350)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (animRef.current) clearTimeout(animRef.current)
    }
  }, [location.pathname])

  if (!visible) return null

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        height: "3px",
        width: `${width}%`,
        background: "linear-gradient(to right, #991b1b, #dc2626)",
        zIndex: 9999,
        transition: width === 0
          ? "none"
          : width === 100
          ? "width 0.3s ease-out, opacity 0.3s ease-out"
          : "width 0.4s cubic-bezier(0.1, 0.5, 0.5, 1)",
        opacity: width === 100 ? 0 : 1,
        boxShadow: "0 0 8px rgba(153, 27, 27, 0.6)",
      }}
    />
  )
}
