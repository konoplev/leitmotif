import { useCallback, useEffect, useState } from 'react'
import { SettingsProvider } from '@/context/SettingsContext'
import { PlansProvider } from '@/context/PlansContext'
import { Sidebar } from '@/components/Sidebar'
import { TrainingView } from '@/components/TrainingView'
import { useMidi } from '@/hooks/useMidi'

declare global {
  interface Window {
    __leitmotifBooted?: boolean
  }
}

export default function App() {
  const midi = useMidi()
  useEffect(() => {
    window.__leitmotifBooted = true
  }, [])
  const [progressVersion, setProgressVersion] = useState(0)
  const [resetVersion, setResetVersion] = useState(0)
  const bumpProgress = useCallback(() => setProgressVersion((v) => v + 1), [])
  const handleReset = useCallback(() => {
    setProgressVersion((v) => v + 1)
    setResetVersion((v) => v + 1)
  }, [])

  return (
    <SettingsProvider>
      <PlansProvider>
        <div className="flex h-dvh flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <Sidebar
            deviceName={midi.deviceName}
            midiSupported={midi.supported}
            progressVersion={progressVersion}
            onReset={handleReset}
          />
          <TrainingView key={resetVersion} midi={midi} onProgress={bumpProgress} />
        </div>
      </PlansProvider>
    </SettingsProvider>
  )
}
