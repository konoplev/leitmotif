import { useEffect, useState } from 'react'
import { Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { usePlans } from '@/context/PlansContext'
import { useSettings } from '@/context/SettingsContext'
import { ALL_CHORDS } from '@/lib/music'
import { isDefaultPlan, itemLabel, parseNotesInput, type Plan, type PlanStep } from '@/lib/plans'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface PlanEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PlanEditor({ open, onOpenChange }: PlanEditorProps) {
  const { plans, savePlan, deletePlan } = usePlans()
  const { settings, update } = useSettings()
  const [selectedId, setSelectedId] = useState(settings.planId)

  // Follow the plan active in the sidebar whenever the dialog opens
  useEffect(() => {
    if (open) setSelectedId(settings.planId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const plan = plans.find((p) => p.id === selectedId) ?? plans[0]

  const mutate = (fn: (p: Plan) => Plan) => savePlan(fn(plan))

  const addPlan = () => {
    const newPlan: Plan = {
      id: `plan_${Date.now()}`,
      name: 'New Plan',
      steps: [{ id: `step_${Date.now()}`, name: 'Step 1', items: [] }],
    }
    savePlan(newPlan)
    setSelectedId(newPlan.id)
  }

  const removePlan = () => {
    if (isDefaultPlan(plan.id)) {
      if (!window.confirm(`Reset "${plan.name}" to its default steps?`)) return
    } else {
      if (!window.confirm(`Delete plan "${plan.name}"?`)) return
    }
    deletePlan(plan.id)
    if (!isDefaultPlan(plan.id)) {
      const fallback = plans.find((p) => p.id !== plan.id)
      setSelectedId(fallback?.id ?? '')
      if (settings.planId === plan.id) update({ planId: fallback?.id ?? 'plan_notes' })
    }
  }

  const addStep = () =>
    mutate((p) => ({
      ...p,
      steps: [...p.steps, { id: `step_${Date.now()}`, name: `Step ${p.steps.length + 1}`, items: [] }],
    }))

  const patchStep = (stepId: string, patch: Partial<PlanStep>) =>
    mutate((p) => ({
      ...p,
      steps: p.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
    }))

  const removeStep = (stepId: string) =>
    mutate((p) => ({ ...p, steps: p.steps.filter((s) => s.id !== stepId) }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Plans</DialogTitle>
          <DialogDescription>
            A plan is a set of named steps; each step holds the notes and chords it trains.
            Changes are saved in this browser.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <select
            value={plan.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-secondary px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {isDefaultPlan(p.id) ? ' (default)' : ''}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={addPlan}>
            <Plus className="h-4 w-4" /> New Plan
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-muted-foreground"
            onClick={removePlan}
            title={isDefaultPlan(plan.id) ? 'Reset to default' : 'Delete plan'}
          >
            {isDefaultPlan(plan.id) ? <RotateCcw className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Name</span>
          <input
            value={plan.name}
            onChange={(e) => mutate((p) => ({ ...p, name: e.target.value }))}
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-secondary px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </label>

        <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto pr-1">
          {plan.steps.map((step, i) => (
            <StepEditor
              key={step.id}
              step={step}
              index={i}
              canDelete={plan.steps.length > 1}
              onPatch={(patch) => patchStep(step.id, patch)}
              onRemove={() => removeStep(step.id)}
            />
          ))}
          <Button variant="outline" size="sm" className="self-start" onClick={addStep}>
            <Plus className="h-4 w-4" /> Add Step
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function StepEditor({
  step,
  index,
  canDelete,
  onPatch,
  onRemove,
}: {
  step: PlanStep
  index: number
  canDelete: boolean
  onPatch: (patch: Partial<PlanStep>) => void
  onRemove: () => void
}) {
  const [notesInput, setNotesInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const addNotes = () => {
    if (!notesInput.trim()) return
    const { ids, errors } = parseNotesInput(notesInput)
    if (errors.length > 0) {
      setError(`Not recognized: ${errors.join(', ')}`)
      return
    }
    setError(null)
    setNotesInput('')
    // Skip duplicates already in the step
    const fresh = ids.filter((id) => !step.items.includes(id))
    if (fresh.length > 0) onPatch({ items: [...step.items, ...fresh] })
  }

  const addChord = (chordId: string) => {
    if (chordId && !step.items.includes(chordId)) {
      onPatch({ items: [...step.items, chordId] })
    }
  }

  const removeItem = (idx: number) =>
    onPatch({ items: step.items.filter((_, i) => i !== idx) })

  return (
    <div className="rounded-lg border bg-secondary/30 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-bold">
          {index + 1}
        </span>
        <input
          value={step.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-secondary px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={onRemove}
          disabled={!canDelete}
          className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-30"
          title="Delete step"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {step.items.length === 0 && (
          <span className="text-xs text-muted-foreground">No cards yet</span>
        )}
        {step.items.map((id, idx) => (
          <span
            key={`${id}_${idx}`}
            className={cn(
              'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs',
              id.startsWith('chord_')
                ? 'border-violet-900 bg-violet-950/50 text-violet-200'
                : 'border-sky-900 bg-sky-950/50 text-sky-200',
            )}
          >
            {itemLabel(id)}
            <button
              onClick={() => removeItem(idx)}
              className="opacity-60 hover:opacity-100"
              aria-label={`Remove ${itemLabel(id)}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={notesInput}
          onChange={(e) => setNotesInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addNotes()}
          placeholder="Notes: C4 F#4 or C3-B3"
          className="h-8 w-44 rounded-md border border-input bg-secondary px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button variant="secondary" size="sm" onClick={addNotes}>
          Add Notes
        </Button>
        <select
          value=""
          onChange={(e) => addChord(e.target.value)}
          className="h-8 rounded-md border border-input bg-secondary px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="" disabled>
            + Add chord…
          </option>
          {ALL_CHORDS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.symbol}
            </option>
          ))}
        </select>
      </div>
      {error && <div className="mt-1.5 text-xs text-red-400">{error}</div>}
    </div>
  )
}
