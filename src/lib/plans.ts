// Training plans: a plan is a named list of steps, each step a named list of
// flashcards (note/chord ids). Default plans ship in the code below; any user
// edits — including edits to the defaults — are stored in localStorage.

import { midiToNote, naturalsInRange, noteFromId, resolveCard } from './music'

export interface PlanStep {
  id: string
  name: string
  /** Card ids: "note_C4", "note_F#3", "chord_C_root", "multi:C4-E4-G4", … */
  items: string[]
  /** Optional custom display names keyed by card id (overrides the default label) */
  itemNames?: Record<string, string>
}

export interface Plan {
  id: string
  name: string
  steps: PlanStep[]
}

const noteIds = (midis: number[], flat = false) => midis.map((m) => midiToNote(m, flat).id)

export const DEFAULT_PLANS: Plan[] = [
  {
    id: 'plan_notes',
    name: 'Notes',
    steps: [
      { id: 'step_notes_1', name: 'C4–G4 · Treble', items: noteIds([60, 62, 64, 65, 67]) },
      { id: 'step_notes_2', name: 'C4–B4 · Treble', items: noteIds(naturalsInRange(60, 71)) },
      { id: 'step_notes_3', name: 'C3–B3 · Bass', items: noteIds(naturalsInRange(48, 59)) },
      {
        id: 'step_notes_4',
        name: 'Accidentals',
        // Both spellings of each middle-octave black key are separate cards
        items: [...noteIds([61, 63, 66, 68, 70]), ...noteIds([61, 63, 66, 68, 70], true)],
      },
      { id: 'step_notes_5', name: 'Full range', items: noteIds(naturalsInRange(21, 108)) },
    ],
  },
  {
    id: 'plan_chords',
    name: 'Chords',
    steps: [
      { id: 'step_chords_1', name: 'C · F · G', items: ['chord_C_root', 'chord_F_root', 'chord_G_root'] },
      { id: 'step_chords_2', name: 'Am · Dm · Em', items: ['chord_Am_root', 'chord_Dm_root', 'chord_Em_root'] },
      {
        id: 'step_chords_3',
        name: 'All white-key triads',
        items: ['C', 'F', 'G', 'Am', 'Dm', 'Em', 'Bdim'].map((k) => `chord_${k}_root`),
      },
      {
        id: 'step_chords_4',
        name: 'Inversions',
        items: ['C', 'F', 'G', 'Am', 'Dm', 'Em'].flatMap((k) => [`chord_${k}_inv1`, `chord_${k}_inv2`]),
      },
      {
        id: 'step_chords_5',
        name: 'Seventh chords',
        items: ['chord_C7_root', 'chord_G7_root', 'chord_Am7_root'],
      },
    ],
  },
]

const DEFAULT_BY_ID = new Map(DEFAULT_PLANS.map((p) => [p.id, p]))

export function isDefaultPlan(id: string): boolean {
  return DEFAULT_BY_ID.has(id)
}

// --- Storage ---

const STORAGE_KEY = 'leitmotif_plans_v1'

type StoredPlans = Record<string, Plan>

function loadStored(): StoredPlans {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredPlans) : {}
  } catch {
    return {}
  }
}

function saveStored(stored: StoredPlans): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Storage disabled: plan edits just won't persist
  }
}

/** All plans: defaults (with any stored edits applied) followed by user-created ones. */
export function loadPlans(): Plan[] {
  const stored = loadStored()
  const defaults = DEFAULT_PLANS.map((p) => stored[p.id] ?? p)
  const customs = Object.values(stored).filter((p) => !DEFAULT_BY_ID.has(p.id))
  return [...defaults, ...customs]
}

export function storePlan(plan: Plan): void {
  const stored = loadStored()
  const def = DEFAULT_BY_ID.get(plan.id)
  if (def && JSON.stringify(def) === JSON.stringify(plan)) {
    delete stored[plan.id] // edited back to the default: no override needed
  } else {
    stored[plan.id] = plan
  }
  saveStored(stored)
}

/** Deletes a custom plan; for a default plan this resets it to the shipped version. */
export function removeStoredPlan(id: string): void {
  const stored = loadStored()
  delete stored[id]
  saveStored(stored)
}

// --- Selection helpers ---

/** Active step ids for a plan, dropping stale ids and defaulting to the first step. */
export function effectiveStepIds(plan: Plan, active: string[] | undefined): string[] {
  const valid = (active ?? []).filter((id) => plan.steps.some((s) => s.id === id))
  if (valid.length > 0) return valid
  return plan.steps.slice(0, 1).map((s) => s.id)
}

/** Map from card id to custom display name across the given steps of a plan. */
export function planItemNames(plan: Plan, stepIds: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const step of plan.steps.filter((s) => stepIds.includes(s.id))) {
    Object.assign(result, step.itemNames)
  }
  return result
}

/** Resolvable card ids across the given steps of a plan. */
export function planItemIds(plan: Plan, stepIds: string[]): string[] {
  return plan.steps
    .filter((s) => stepIds.includes(s.id))
    .flatMap((s) => s.items)
    .filter((id) => resolveCard(id) !== null)
}

/** Short display label for a card id, with optional per-step name override. */
export function itemLabel(id: string, names?: Record<string, string>): string {
  if (names?.[id]) return names[id]
  const target = resolveCard(id)
  if (!target) return id
  return target.kind === 'note' ? target.note.label : target.chord.symbol
}

// --- Editor input parsing ---

/**
 * Parse a chord defined by its constituent notes: space/comma/+-separated
 * tokens, each a single note ("C4", "F#3", "Bb2"). Returns a "multi:" id
 * sorted by MIDI, or an error list if any token is invalid.
 * Requires at least 2 distinct pitches.
 */
export function parseChordInput(text: string): { id: string | null; errors: string[] } {
  const tokens = text.trim().split(/[\s,+]+/).filter(Boolean)
  if (tokens.length === 0) return { id: null, errors: [] }
  const pairs = tokens.map((token) => {
    const m = /^([A-Ga-g])(#|b)?(\d)$/.exec(token)
    if (!m) return { token, note: null as ReturnType<typeof noteFromId> }
    return { token, note: noteFromId(`note_${m[1].toUpperCase()}${m[2] ?? ''}${m[3]}`) }
  })
  const errors = pairs.filter((p) => p.note === null).map((p) => p.token)
  if (errors.length > 0) return { id: null, errors }
  // Deduplicate by MIDI, sort low→high
  const seen = new Set<number>()
  const sorted = (pairs.map((p) => p.note!) as NonNullable<ReturnType<typeof noteFromId>>[])
    .filter((n) => { if (seen.has(n.midi)) return false; seen.add(n.midi); return true })
    .sort((a, b) => a.midi - b.midi)
  if (sorted.length < 2) return { id: null, errors: ['Need at least 2 different notes for a chord'] }
  return { id: `multi:${sorted.map((n) => n.label).join('-')}`, errors: [] }
}

/**
 * Parse user note input: tokens separated by spaces/commas, each either a
 * single note ("C4", "F#3", "Bb2") or a range of naturals ("C3-B3").
 */
export function parseNotesInput(text: string): { ids: string[]; errors: string[] } {
  const ids: string[] = []
  const errors: string[] = []
  const tokens = text.split(/[\s,]+/).filter(Boolean)
  for (const token of tokens) {
    const range = /^([A-Ga-g])(\d)\s*[-–]\s*([A-Ga-g])(\d)$/.exec(token)
    if (range) {
      const lo = noteFromId(`note_${range[1].toUpperCase()}${range[2]}`)
      const hi = noteFromId(`note_${range[3].toUpperCase()}${range[4]}`)
      if (!lo || !hi || lo.midi > hi.midi) {
        errors.push(token)
        continue
      }
      ids.push(...naturalsInRange(lo.midi, hi.midi).map((m) => midiToNote(m).id))
      continue
    }
    const single = /^([A-Ga-g])(#|b)?(\d)$/.exec(token)
    const note = single ? noteFromId(`note_${single[1].toUpperCase()}${single[2] ?? ''}${single[3]}`) : null
    if (note) ids.push(note.id)
    else errors.push(token)
  }
  return { ids, errors }
}
