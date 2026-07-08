import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type TrainingMode = 'note' | 'chord'
export type ChordDisplayMode = 'staff' | 'letters' | 'keyboard'

export interface Settings {
  mode: TrainingMode
  noteLevels: number[]
  chordLevels: number[]
  maxAttempts: number
  chordDisplay: ChordDisplayMode
  smartMode: boolean
}

const DEFAULT_SETTINGS: Settings = {
  mode: 'note',
  noteLevels: [1],
  chordLevels: [1],
  maxAttempts: 2,
  chordDisplay: 'staff',
  smartMode: true,
}

const STORAGE_KEY = 'leitmotif_settings_v1'

interface SettingsContextValue {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }

  return <SettingsContext.Provider value={{ settings, update }}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
