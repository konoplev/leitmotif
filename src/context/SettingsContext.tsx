import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ChordDisplayMode = 'staff' | 'letters' | 'keyboard'

export interface Settings {
  /** Selected training plan */
  planId: string
  /** Active step ids, remembered per plan */
  activeSteps: Record<string, string[]>
  maxAttempts: number
  chordDisplay: ChordDisplayMode
  smartMode: boolean
}

const DEFAULT_SETTINGS: Settings = {
  planId: 'plan_notes',
  activeSteps: {},
  maxAttempts: 2,
  chordDisplay: 'staff',
  smartMode: true,
}

const STORAGE_KEY = 'leitmotif_settings_v2'
const LEGACY_STORAGE_KEY = 'leitmotif_settings_v1'

interface SettingsContextValue {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

/** Map the old mode/levels settings onto the default plans. */
function migrateLegacy(): Partial<Settings> | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return null
    const old = JSON.parse(raw) as {
      mode?: string
      noteLevels?: number[]
      chordLevels?: number[]
      maxAttempts?: number
      chordDisplay?: ChordDisplayMode
      smartMode?: boolean
    }
    return {
      planId: old.mode === 'chord' ? 'plan_chords' : 'plan_notes',
      activeSteps: {
        plan_notes: (old.noteLevels ?? [1]).map((n) => `step_notes_${n}`),
        plan_chords: (old.chordLevels ?? [1]).map((n) => `step_chords_${n}`),
      },
      maxAttempts: old.maxAttempts ?? DEFAULT_SETTINGS.maxAttempts,
      chordDisplay: old.chordDisplay ?? DEFAULT_SETTINGS.chordDisplay,
      smartMode: old.smartMode ?? DEFAULT_SETTINGS.smartMode,
    }
  } catch {
    return null
  }
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
    const legacy = migrateLegacy()
    return legacy ? { ...DEFAULT_SETTINGS, ...legacy } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // Storage disabled: settings just won't persist
    }
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
