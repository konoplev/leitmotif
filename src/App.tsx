import { useCallback, useState } from 'react'
import { SettingsProvider } from '@/context/SettingsContext'
import { ToastProvider } from '@/components/ui/toast'
import { Sidebar } from '@/components/Sidebar'
import { TrainingView } from '@/components/TrainingView'
import { useMidi } from '@/hooks/useMidi'

export default function App() {
  const midi = useMidi()
  const [progressVersion, setProgressVersion] = useState(0)
  const [resetVersion, setResetVersion] = useState(0)
  const bumpProgress = useCallback(() => setProgressVersion((v) => v + 1), [])
  const handleReset = useCallback(() => {
    setProgressVersion((v) => v + 1)
    setResetVersion((v) => v + 1)
  }, [])

  return (
    <SettingsProvider>
      <ToastProvider>
        <div className="flex h-dvh flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <Sidebar
            deviceName={midi.deviceName}
            midiSupported={midi.supported}
            progressVersion={progressVersion}
            onReset={handleReset}
          />
          <TrainingView key={resetVersion} midi={midi} onProgress={bumpProgress} />
        </div>
      </ToastProvider>
    </SettingsProvider>
  )
}
