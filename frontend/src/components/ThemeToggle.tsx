"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="w-9 h-9" /> // Placeholder to prevent layout shift
  }

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="relative p-2 rounded-full glass glass-hover transition-all duration-200 cursor-pointer overflow-hidden flex items-center justify-center w-9 h-9"
      title="Toggle theme"
    >
      <Sun className="h-4 w-4 text-amber-500 transition-all absolute" style={{ transform: theme === 'dark' ? 'scale(0) rotate(-90deg)' : 'scale(1) rotate(0deg)', opacity: theme === 'dark' ? 0 : 1 }} />
      <Moon className="h-4 w-4 text-indigo-400 transition-all absolute" style={{ transform: theme === 'dark' ? 'scale(1) rotate(0deg)' : 'scale(0) rotate(90deg)', opacity: theme === 'dark' ? 1 : 0 }} />
      <span className="sr-only">Toggle theme</span>
    </button>
  )
}
