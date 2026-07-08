// Music theory engine: note mapping, level groups, chord definitions, validation.
// MIDI note 60 = C4 (middle C). Supported range: A0 (21) to C8 (108).

export type Clef = 'treble' | 'bass'

export interface NoteSpec {
  id: string
  midi: number
  /** VexFlow key string, e.g. "c#/4" */
  vexKey: string
  accidental?: '#' | 'b'
  clef: Clef
  label: string
}

export interface ChordSpec {
  id: string
  symbol: string
  /** Canonical voicing as MIDI notes, low to high */
  voicing: number[]
  /** Pitch classes (0-11) that make up the chord */
  pitchClasses: number[]
  /** Pitch class required in the bass for strict (inversion-aware) checking */
  bassPc: number
  label: string
}

const PC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const PC_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12
}

export function midiToLabel(midi: number, flat = false): string {
  const octave = Math.floor(midi / 12) - 1
  const name = (flat ? PC_FLAT : PC_SHARP)[pitchClass(midi)]
  return `${name}${octave}`
}

export function midiToNote(midi: number, flat = false): NoteSpec {
  const octave = Math.floor(midi / 12) - 1
  const pc = pitchClass(midi)
  const name = (flat ? PC_FLAT : PC_SHARP)[pc]
  const letter = name[0].toLowerCase()
  const accidental = name.length > 1 ? (name[1] as '#' | 'b') : undefined
  return {
    id: `note_${name}${octave}`,
    midi,
    vexKey: `${letter}${accidental ?? ''}/${octave}`,
    accidental,
    clef: midi >= 60 ? 'treble' : 'bass',
    label: `${name}${octave}`,
  }
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(pitchClass(midi))
}

function naturalsInRange(lo: number, hi: number): number[] {
  const out: number[] = []
  for (let m = lo; m <= hi; m++) if (!isBlackKey(m)) out.push(m)
  return out
}

// --- Note level groups ---

export const NOTE_LEVELS: Record<number, { name: string; notes: NoteSpec[] }> = {
  1: {
    name: 'C4–G4 · Treble',
    notes: [60, 62, 64, 65, 67].map((m) => midiToNote(m)),
  },
  2: {
    name: 'C4–B4 · Treble',
    notes: naturalsInRange(60, 71).map((m) => midiToNote(m)),
  },
  3: {
    name: 'C3–B3 · Bass',
    notes: naturalsInRange(48, 59).map((m) => midiToNote(m)),
  },
  4: {
    name: 'Accidentals',
    notes: [
      // Both spellings of each middle-octave black key are separate cards
      ...[61, 63, 66, 68, 70].map((m) => midiToNote(m, false)),
      ...[61, 63, 66, 68, 70].map((m) => midiToNote(m, true)),
    ],
  },
  5: {
    name: 'Full range',
    notes: naturalsInRange(21, 108).map((m) => midiToNote(m)),
  },
}

// --- Chord definitions ---

interface ChordShape {
  symbol: string
  /** Root-position voicing near middle C */
  root: number[]
}

const TRIADS: Record<string, ChordShape> = {
  C: { symbol: 'C', root: [60, 64, 67] },
  F: { symbol: 'F', root: [65, 69, 72] },
  G: { symbol: 'G', root: [55, 59, 62] },
  Am: { symbol: 'Am', root: [57, 60, 64] },
  Dm: { symbol: 'Dm', root: [62, 65, 69] },
  Em: { symbol: 'Em', root: [64, 67, 71] },
  Bdim: { symbol: 'B°', root: [59, 62, 65] },
}

const SEVENTHS: Record<string, ChordShape> = {
  C7: { symbol: 'C7', root: [60, 64, 67, 70] },
  G7: { symbol: 'G7', root: [55, 59, 62, 65] },
  Am7: { symbol: 'Am7', root: [57, 60, 64, 67] },
}

function invert(voicing: number[], inversion: number): number[] {
  const v = [...voicing]
  for (let i = 0; i < inversion; i++) {
    const lowest = v.shift()!
    v.push(lowest + 12)
  }
  return v
}

const INVERSION_SUFFIX = ['', '1st inv', '2nd inv']

function makeChord(key: string, shape: ChordShape, inversion = 0): ChordSpec {
  const voicing = invert(shape.root, inversion)
  const suffix = INVERSION_SUFFIX[inversion]
  return {
    id: `chord_${key}_${inversion === 0 ? 'root' : `inv${inversion}`}`,
    symbol: suffix ? `${shape.symbol} · ${suffix}` : shape.symbol,
    voicing,
    pitchClasses: [...new Set(voicing.map(pitchClass))],
    bassPc: pitchClass(voicing[0]),
    label: shape.symbol,
  }
}

export const CHORD_LEVELS: Record<number, { name: string; chords: ChordSpec[] }> = {
  1: {
    name: 'C · F · G',
    chords: ['C', 'F', 'G'].map((k) => makeChord(k, TRIADS[k])),
  },
  2: {
    name: 'Am · Dm · Em',
    chords: ['Am', 'Dm', 'Em'].map((k) => makeChord(k, TRIADS[k])),
  },
  3: {
    name: 'All white-key triads',
    chords: Object.entries(TRIADS).map(([k, s]) => makeChord(k, s)),
  },
  4: {
    name: 'Inversions',
    chords: ['C', 'F', 'G', 'Am', 'Dm', 'Em'].flatMap((k) => [
      makeChord(k, TRIADS[k], 1),
      makeChord(k, TRIADS[k], 2),
    ]),
  },
  5: {
    name: 'Seventh chords',
    chords: Object.entries(SEVENTHS).map(([k, s]) => makeChord(k, s)),
  },
}

// --- Lookup by card id ---

export const NOTE_BY_ID: Record<string, NoteSpec> = Object.fromEntries(
  Object.values(NOTE_LEVELS).flatMap((l) => l.notes.map((n) => [n.id, n])),
)

export const CHORD_BY_ID: Record<string, ChordSpec> = Object.fromEntries(
  Object.values(CHORD_LEVELS).flatMap((l) => l.chords.map((c) => [c.id, c])),
)

// --- Validation ---

export function noteMatches(target: NoteSpec, playedMidi: number): boolean {
  return playedMidi === target.midi
}

/**
 * Smart mode: any combination of the chord's pitch classes across any octave.
 * Strict mode: exact chord size, matching pitch classes, and the requested
 * inversion (lowest sounding note carries the required bass pitch class).
 */
export function chordMatches(target: ChordSpec, held: number[], smart: boolean): boolean {
  if (held.length === 0) return false
  const heldPcs = [...new Set(held.map(pitchClass))].sort((a, b) => a - b)
  const targetPcs = [...target.pitchClasses].sort((a, b) => a - b)
  const pcsEqual =
    heldPcs.length === targetPcs.length && heldPcs.every((pc, i) => pc === targetPcs[i])
  if (!pcsEqual) return false
  if (smart) return true
  return held.length === target.voicing.length && pitchClass(Math.min(...held)) === target.bassPc
}

/** VexFlow-renderable keys for a chord voicing (sharp spellings). */
export function chordVexKeys(chord: ChordSpec): NoteSpec[] {
  return chord.voicing.map((m) => midiToNote(m))
}

/** Clef that best fits a set of MIDI notes. */
export function clefForMidi(notes: number[]): Clef {
  const avg = notes.reduce((a, b) => a + b, 0) / notes.length
  return avg >= 60 ? 'treble' : 'bass'
}
