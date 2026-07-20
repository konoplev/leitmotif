import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useSettings } from '@/context/SettingsContext'
import { usePlans } from '@/context/PlansContext'
import {
  chordMatches,
  chordVexKeys,
  clefForMidi,
  midiToLabel,
  noteMatches,
  pitchClass,
  resolveCard,
  type ChordSpec,
} from '@/lib/music'
import { effectiveStepIds, planItemIds, planItemNames } from '@/lib/plans'
import {
  demoteCard,
  getDeck,
  pickNextCard,
  promoteCard,
  retainCard,
  type FlashCard,
} from '@/lib/leitner'
import type { MidiState } from '@/hooks/useMidi'
import { MusicSheet } from '@/components/MusicSheet'
import { PianoKeyboard, keyboardWindowFor } from '@/components/PianoKeyboard'
import { cn } from '@/lib/utils'

type Phase = 'waiting' | 'success' | 'reveal'

interface Feedback {
  text: string
  tone: 'success' | 'error'
}

interface PressedNote {
  midi: number
  label: string
  correct: boolean
}

const CHORD_DEBOUNCE_MS = 80
const SUCCESS_ADVANCE_MS = 1100
const FLASH_MS = 350

interface TrainingViewProps {
  midi: MidiState
  onProgress: () => void
}

export function TrainingView({ midi, onProgress }: TrainingViewProps) {
  const { settings } = useSettings()
  const { plans } = usePlans()
  const { activeNotes, lastNoteOn, deviceName, virtualNoteOn, virtualNoteOff, releaseAllVirtual } =
    midi

  const plan = plans.find((p) => p.id === settings.planId) ?? plans[0]
  const stepIds = effectiveStepIds(plan, settings.activeSteps[plan.id])
  const itemIds = useMemo(
    () => planItemIds(plan, stepIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, stepIds.join(',')],
  )
  const nameOverrides = useMemo(
    () => planItemNames(plan, stepIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, stepIds.join(',')],
  )
  const deckKey = itemIds.join(',')

  const [card, setCard] = useState<FlashCard | null>(null)
  const [phase, setPhase] = useState<Phase>('waiting')
  const [attempts, setAttempts] = useState(0)
  const [flashNotes, setFlashNotes] = useState<number[]>([])
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [pressedNote, setPressedNote] = useState<PressedNote | null>(null)

  const phaseRef = useRef<Phase>('waiting')
  const attemptsRef = useRef(0)
  const cardRef = useRef<FlashCard | null>(null)
  const activeNotesRef = useRef<ReadonlySet<number>>(new Set())
  const readyRef = useRef(true) // false after a wrong attempt until all keys released
  const processedSeqRef = useRef(0)
  const timersRef = useRef<number[]>([])

  phaseRef.current = phase
  attemptsRef.current = attempts
  cardRef.current = card
  activeNotesRef.current = activeNotes
  const lastSeqRef = useRef(0)
  lastSeqRef.current = lastNoteOn?.seq ?? 0

  const later = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms))
  }, [])

  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  const target = useMemo(() => (card ? resolveCard(card.id) : null), [card])

  const targetMidis = useMemo(() => {
    if (!target) return []
    return target.kind === 'note' ? [target.note.midi] : target.chord.voicing
  }, [target])

  const advance = useCallback(() => {
    const deck = getDeck(itemIds)
    const next = pickNextCard(deck, cardRef.current?.id)
    setCard(next)
    setPhase('waiting')
    setAttempts(0)
    setFlashNotes([])
    setFeedback(null)
    setPressedNote(null)
    // Keys still held from the previous card must be released first,
    // and note-ons that happened before this card was shown don't count
    readyRef.current = activeNotesRef.current.size === 0
    processedSeqRef.current = lastSeqRef.current
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckKey])

  // New card whenever the plan or active steps change (also on mount)
  useEffect(() => {
    cardRef.current = null
    advance()
  }, [advance])

  const succeed = useCallback(() => {
    const current = cardRef.current
    if (!current) return
    setPhase('success')
    releaseAllVirtual()
    if (attemptsRef.current === 0) {
      const updated = promoteCard(current)
      setFeedback({
        text:
          updated.box > current.box
            ? `Excellent! Box ${current.box} → ${updated.box}`
            : `Excellent! Mastered — stays in Box ${updated.box}`,
        tone: 'success',
      })
    } else {
      const updated = retainCard(current)
      setFeedback({
        text: `Correct — stays in Box ${updated.box}, reviews again in 1 min`,
        tone: 'success',
      })
    }
    onProgress()
    later(advance, SUCCESS_ADVANCE_MS)
  }, [advance, later, onProgress, releaseAllVirtual])

  const fail = useCallback(
    (wrongNotes: number[]) => {
      const current = cardRef.current
      if (!current) return
      releaseAllVirtual()
      readyRef.current = false
      setFlashNotes(wrongNotes)
      later(() => setFlashNotes([]), FLASH_MS)

      const used = attemptsRef.current + 1
      setAttempts(used)
      if (used >= settings.maxAttempts) {
        demoteCard(current)
        setPhase('reveal')
        const t = resolveCard(current.id)
        setFeedback({
          text:
            t?.kind === 'note'
              ? `Out of attempts — the answer is ${t.note.label}. Play it to continue`
              : 'Out of attempts — play the keys shown in green to continue',
          tone: 'error',
        })
        onProgress()
      } else {
        const left = settings.maxAttempts - used
        setFeedback({
          text: `Incorrect — try again (${left} attempt${left === 1 ? '' : 's'} left)`,
          tone: 'error',
        })
      }
    },
    [later, onProgress, releaseAllVirtual, settings.maxAttempts],
  )

  // Re-arm input once every key is released after a wrong attempt
  useEffect(() => {
    if (activeNotes.size === 0) readyRef.current = true
  }, [activeNotes])

  // Note cards: judge every note-on immediately. In the reveal phase the
  // correct note must be played to move on (there is no Next button).
  useEffect(() => {
    if (!lastNoteOn || lastNoteOn.seq <= processedSeqRef.current) return
    if (!target || target.kind !== 'note') return
    const currentPhase = phaseRef.current
    if (currentPhase === 'success') return
    if (currentPhase === 'waiting' && !readyRef.current) return
    processedSeqRef.current = lastNoteOn.seq
    const correct = noteMatches(target.note, lastNoteOn.note)
    setPressedNote({
      midi: lastNoteOn.note,
      label: correct ? target.note.label : midiToLabel(lastNoteOn.note),
      correct,
    })
    if (currentPhase === 'waiting') {
      if (correct) succeed()
      else fail([lastNoteOn.note])
    } else if (correct) {
      advance()
    } else {
      setFlashNotes([lastNoteOn.note])
      later(() => setFlashNotes([]), FLASH_MS)
    }
  }, [lastNoteOn, target, succeed, fail, advance, later])

  // Chord cards: debounce so near-simultaneous key presses register as one
  // chord. In the reveal phase a correct chord advances; wrong ones are ignored.
  useEffect(() => {
    if (!target || target.kind !== 'chord' || phase === 'success') return
    const chord = target.chord
    const required = chord.pitchClasses.length
    if (activeNotes.size < required) return
    const timer = window.setTimeout(() => {
      const currentPhase = phaseRef.current
      if (currentPhase === 'success') return
      if (currentPhase === 'waiting' && !readyRef.current) return
      const held = [...activeNotesRef.current]
      if (held.length < required) return
      const correct = chordMatches(chord, held, settings.smartMode)
      if (currentPhase === 'waiting') {
        if (correct) succeed()
        else fail(held)
      } else if (correct) {
        advance()
      }
    }, CHORD_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [activeNotes, target, phase, settings.smartMode, succeed, fail, advance])

  // Virtual keyboard: momentary press for note cards, toggle for chord cards
  const handleVirtualKey = useCallback(
    (midiNote: number) => {
      if (phaseRef.current === 'success') return
      if (cardRef.current?.type === 'chord') {
        if (activeNotesRef.current.has(midiNote)) virtualNoteOff(midiNote)
        else virtualNoteOn(midiNote)
      } else {
        virtualNoteOn(midiNote)
        later(() => virtualNoteOff(midiNote), 180)
      }
    },
    [virtualNoteOn, virtualNoteOff, later],
  )

  const keyboardStart = useMemo(() => keyboardWindowFor(targetMidis), [targetMidis])
  const revealNotes = phase === 'reveal' ? targetMidis : []
  const hintNotes =
    target?.kind === 'chord' && settings.chordDisplay === 'keyboard' && phase === 'waiting'
      ? targetMidis
      : []

  // Pressed-key labels: for chords show every held key live, for notes the last press
  const pressedDisplay: PressedNote[] =
    target?.kind === 'chord'
      ? [...activeNotes]
          .sort((a, b) => a - b)
          .map((m) => ({
            midi: m,
            label: midiToLabel(m),
            correct: target.chord.pitchClasses.includes(pitchClass(m)),
          }))
      : pressedNote
        ? [pressedNote]
        : []

  return (
    <main className="order-1 flex min-h-dvh min-w-0 flex-1 flex-col lg:order-2 lg:min-h-0">
      {/* Flashcard display */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        {/* Fixed-height message zone so the staff below never moves */}
        <div className="flex h-28 w-full max-w-lg flex-col items-center justify-end gap-2 text-center">
          <div className="flex flex-1 items-center">
            <StatusBanner feedback={feedback} target={target} />
          </div>
          <div className="flex h-12 items-center gap-3">
            {pressedDisplay.map((p) => (
              <span
                key={p.midi}
                className={cn(
                  'text-4xl font-bold tabular-nums',
                  p.correct ? 'text-emerald-400' : 'text-red-400',
                )}
              >
                {p.label}
              </span>
            ))}
          </div>
        </div>

        {target?.kind === 'note' && (
          <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-sm">
            <MusicSheet clef={target.note.clef} notes={[target.note]} />
          </div>
        )}

        {target?.kind === 'chord' && (
          <div className="flex w-full max-w-lg flex-col items-center gap-4 rounded-xl border bg-card p-8 shadow-sm">
            <ChordSymbol chord={target.chord} name={nameOverrides[target.chord.id]} />
            {settings.chordDisplay === 'staff' && (
              <MusicSheet
                clef={clefForMidi(target.chord.voicing)}
                notes={chordVexKeys(target.chord)}
                height={180}
              />
            )}
          </div>
        )}

        <AttemptDots used={attempts} max={settings.maxAttempts} />
      </div>

      {/* Virtual keyboard */}
      <div className="border-t bg-card/50 px-6 pb-5 pt-4">
        <div className="mx-auto mb-2 flex max-w-3xl items-center justify-between text-xs text-muted-foreground">
          <span>
            {deviceName ? 'Mirroring your MIDI keyboard' : 'Click keys to play'}
            {!deviceName && target?.kind === 'chord' && ' — clicks toggle keys on/off'}
          </span>
          {card && <span className="tabular-nums">Box {card.box}</span>}
        </div>
        <PianoKeyboard
          startMidi={keyboardStart}
          pressed={activeNotes}
          reveal={revealNotes}
          flash={flashNotes}
          hint={hintNotes}
          onKeyPress={handleVirtualKey}
        />
      </div>
    </main>
  )
}

function ChordSymbol({ chord, name }: { chord: ChordSpec; name?: string }) {
  const display = name ?? chord.symbol
  const [main, sub] = display.split(' · ')
  return (
    <div className="text-center">
      <div className="text-7xl font-bold tracking-tight">{main}</div>
      {sub && <div className="mt-1 text-sm uppercase tracking-widest text-muted-foreground">{sub}</div>}
    </div>
  )
}

function StatusBanner({
  feedback,
  target,
}: {
  feedback: Feedback | null
  target: ReturnType<typeof resolveCard> | null
}) {
  if (feedback) {
    const success = feedback.tone === 'success'
    const Icon = success ? CheckCircle2 : XCircle
    return (
      <div
        className={cn(
          'flex items-center gap-2',
          success ? 'text-emerald-400' : 'text-red-400',
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="font-medium">{feedback.text}</span>
      </div>
    )
  }
  if (!target) {
    return (
      <div className="text-muted-foreground">
        This step has no cards yet — add notes or chords in the plan editor
      </div>
    )
  }
  return (
    <div className="text-muted-foreground">
      {target.kind === 'chord' ? 'Play the chord shown below' : 'Play the note shown below'}
    </div>
  )
}

function AttemptDots({ used, max }: { used: number; max: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-2.5 w-2.5 rounded-full border transition-colors',
            i < used ? 'border-red-500 bg-red-500' : 'border-muted-foreground/40 bg-transparent',
          )}
        />
      ))}
    </div>
  )
}
