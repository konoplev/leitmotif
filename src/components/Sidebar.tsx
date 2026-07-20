import { useMemo, useState } from 'react'
import { Music, Pencil, Piano, RotateCcw } from 'lucide-react'
import { useSettings, type ChordDisplayMode } from '@/context/SettingsContext'
import { usePlans } from '@/context/PlansContext'
import { effectiveStepIds, planItemIds } from '@/lib/plans'
import { boxDistribution, dueCount, getDeck, resetProgress } from '@/lib/leitner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { PlanEditor } from '@/components/PlanEditor'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface SidebarProps {
  deviceName: string | null
  midiSupported: boolean
  /** Bumped by the training view after every answer so stats stay live */
  progressVersion: number
  onReset: () => void
}

const CHORD_DISPLAY_OPTIONS: { value: ChordDisplayMode; label: string }[] = [
  { value: 'staff', label: 'Show on Staff' },
  { value: 'letters', label: 'Show Letters Only' },
  { value: 'keyboard', label: 'Show Keyboard Hint' },
]

export function Sidebar({ deviceName, midiSupported, progressVersion, onReset }: SidebarProps) {
  const { settings, update } = useSettings()
  const { plans } = usePlans()
  const [resetOpen, setResetOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)

  const plan = plans.find((p) => p.id === settings.planId) ?? plans[0]
  const activeIds = effectiveStepIds(plan, settings.activeSteps[plan.id])

  const deck = useMemo(
    () => getDeck(planItemIds(plan, activeIds)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, activeIds.join(','), progressVersion],
  )
  const due = dueCount(deck)
  const dist = boxDistribution(deck)
  const maxDist = Math.max(1, ...dist)

  const toggleStep = (stepId: string) => {
    const next = activeIds.includes(stepId)
      ? activeIds.filter((id) => id !== stepId)
      : plan.steps.filter((s) => activeIds.includes(s.id) || s.id === stepId).map((s) => s.id)
    if (next.length === 0) return // keep at least one step active
    update({ activeSteps: { ...settings.activeSteps, [plan.id]: next } })
  }

  const handleReset = () => {
    resetProgress()
    setResetOpen(false)
    onReset()
  }

  return (
    <aside className="order-2 flex w-full shrink-0 flex-col gap-6 border-t bg-card p-5 lg:order-1 lg:h-full lg:w-80 lg:overflow-y-auto lg:border-r lg:border-t-0">
      <div className="flex items-center gap-2">
        <Piano className="h-5 w-5" />
        <h1 className="text-lg font-semibold tracking-tight">Leitmotif</h1>
        <span className="ml-auto text-xs text-muted-foreground">MIDI Trainer</span>
      </div>

      {/* Connection status */}
      <div
        className={cn(
          'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm',
          deviceName
            ? 'border-emerald-900 bg-emerald-950/50 text-emerald-300'
            : 'border-amber-900 bg-amber-950/50 text-amber-300',
        )}
      >
        <span
          className={cn(
            'h-2.5 w-2.5 shrink-0 rounded-full animate-pulse-dot',
            deviceName ? 'bg-emerald-400' : 'bg-amber-400',
          )}
        />
        <span className="min-w-0 truncate">
          {deviceName
            ? deviceName
            : midiSupported
              ? 'Waiting for MIDI… Virtual keyboard active'
              : 'Web MIDI unavailable — virtual keyboard only'}
        </span>
      </div>

      {/* Plan selector */}
      <section className="space-y-2">
        <Label>Training Plan</Label>
        <div className="flex items-center gap-2">
          <select
            value={plan.id}
            onChange={(e) => update({ planId: e.target.value })}
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-secondary px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditorOpen(true)}
            title="Edit plans"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Step selector */}
      <section className="space-y-2">
        <Label>Active Steps</Label>
        <div className="grid gap-1.5">
          {plan.steps.map((step, i) => {
            const active = activeIds.includes(step.id)
            return (
              <button
                key={step.id}
                onClick={() => toggleStep(step.id)}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  active
                    ? 'border-primary/40 bg-accent text-accent-foreground'
                    : 'border-transparent bg-secondary/50 text-muted-foreground hover:bg-secondary',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold',
                    active ? 'bg-primary text-primary-foreground' : 'bg-muted',
                  )}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 truncate">{step.name}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {step.items.length}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Settings */}
      <section className="space-y-4">
        <Label>Settings</Label>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Max Attempts</span>
            <span className="tabular-nums text-muted-foreground">{settings.maxAttempts}</span>
          </div>
          <Slider
            min={1}
            max={5}
            step={1}
            value={[settings.maxAttempts]}
            onValueChange={([v]) => update({ maxAttempts: v })}
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-sm">Chord Display Mode</span>
          <select
            value={settings.chordDisplay}
            onChange={(e) => update({ chordDisplay: e.target.value as ChordDisplayMode })}
            className="h-9 w-full rounded-md border border-input bg-secondary px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {CHORD_DISPLAY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm">Smart Evaluation</div>
            <div className="text-xs text-muted-foreground">Accept chords in any octave</div>
          </div>
          <Switch
            checked={settings.smartMode}
            onCheckedChange={(v) => update({ smartMode: v })}
          />
        </div>
      </section>

      {/* Progress */}
      <section className="space-y-2">
        <Label>Progress</Label>
        <div className="rounded-lg border bg-secondary/30 p-3">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Cards due</span>
            <span className="font-semibold tabular-nums">{due} / {deck.length}</span>
          </div>
          <div className="flex h-14 items-end gap-1.5">
            {dist.map((count, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-sm bg-primary/70"
                  style={{ height: `${Math.max(4, (count / maxDist) * 40)}px` }}
                  title={`Box ${i + 1}: ${count}`}
                />
                <span className="text-[10px] text-muted-foreground">B{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-auto">
        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full text-muted-foreground">
              <RotateCcw className="h-4 w-4" /> Reset Progress
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset all progress?</DialogTitle>
              <DialogDescription>
                This clears every flashcard back to Box 1 and cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setResetOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleReset}>
                Reset
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Music className="h-3 w-3" /> Leitner spaced repetition · stored locally
      </div>

      <PlanEditor open={editorOpen} onOpenChange={setEditorOpen} />
    </aside>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  )
}
