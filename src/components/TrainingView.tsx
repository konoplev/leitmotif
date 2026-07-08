import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react'
import { useSettings } from '@/context/SettingsContext'
import {
  CHORD_BY_ID,
  NOTE_BY_ID,
  chordMatches,
  chordVexKeys,
  clefForMidi,
  noteMatches,
  type ChordSpec,
} from '@/lib/music'
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
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type Phase = 'waiting' | 'success' | 'reveal'

const CHORD_DEBOUNCE_MS = 80
const SUCCESS_ADVANCE_MS = 1100
const FLASH_MS = 350

interface TrainingViewProps {
  midi: MidiState
  onProgress: () => void
}

export function TrainingView({ midi, onProgress }: TrainingViewProps) {
  const { settings } = useSettings()
  const { toast } = useToast()
  const { activeNotes, lastNoteOn, deviceName, virtualNoteOn, virtualNoteOff, releaseAllVirtual } =
    midi

  const levels = settings.mode === 'note' ? settings.noteLevels : settings.chordLevels
  const levelKey = `${settings.mode}:${levels.join(',')}`

  const [card, setCard] = useState<FlashCard | null>(null)
  const [phase, setPhase] = useState<Phase>('waiting')
  const [attempts, setAttempts] = useState(0)
  const [flashNotes, setFlashNotes] = useState<number[]>([])

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

  const target = useMemo(() => {
    if (!card) return null
    return card.type === 'note'
      ? { kind: 'note' as const, note: NOTE_BY_ID[card.id], chord: undefined }
      : { kind: 'chord' as const, note: undefined, chord: CHORD_BY_ID[card.id] }
  }, [card])

  const targetMidis = useMemo(() => {
    if (!target) return []
    return target.kind === 'note' ? [target.note.midi] : target.chord.voicing
  }, [target])

  const advance = useCallback(() => {
    const deck = getDeck(settings.mode, levels)
    const next = pickNextCard(deck, cardRef.current?.id)
    setCard(next)
    setPhase('waiting')
    setAttempts(0)
    setFlashNotes([])
    // Keys still held from the previous card must be released first,
    // and note-ons that happened before this card was shown don't count
    readyRef.current = activeNotesRef.current.size === 0
    processedSeqRef.current = lastSeqRef.current
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelKey])

  // New card whenever the mode or active levels change (also on mount)
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
      toast({
        title: 'Excellent!',
        description:
          updated.box > current.box
            ? `Card moved up: Box ${current.box} → ${updated.box}`
            : `Mastered — stays in Box ${updated.box}`,
        variant: 'success',
      })
    } else {
      const updated = retainCard(current)
      toast({
        title: 'Correct',
        description: `Stays in Box ${updated.box} · reviews again in 1 min`,
        variant: 'success',
      })
    }
    onProgress()
    later(advance, SUCCESS_ADVANCE_MS)
  }, [advance, later, onProgress, releaseAllVirtual, toast])

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
        toast({
          title: 'Out of attempts',
          description: 'Card dropped to Box 1 — the correct keys are shown in green.',
          variant: 'destructive',
        })
        onProgress()
      } else {
        const left = settings.maxAttempts - used
        toast({
          title: 'Incorrect — try again',
          description: `${left} attempt${left === 1 ? '' : 's'} left`,
          variant: 'destructive',
        })
      }
    },
    [later, onProgress, releaseAllVirtual, settings.maxAttempts, toast],
  )

  // Re-arm input once every key is released after a wrong attempt
  useEffect(() => {
    if (activeNotes.size === 0) readyRef.current = true
  }, [activeNotes])

  // Note mode: judge every note-on immediately
  useEffect(() => {
    if (!lastNoteOn || lastNoteOn.seq <= processedSeqRef.current) return
    if (phaseRef.current !== 'waiting' || !target || target.kind !== 'note') return
    if (!readyRef.current) return
    processedSeqRef.current = lastNoteOn.seq
    if (noteMatches(target.note, lastNoteOn.note)) {
      succeed()
    } else {
      fail([lastNoteOn.note])
    }
  }, [lastNoteOn, target, succeed, fail])

  // Chord mode: debounce so near-simultaneous key presses register as one chord
  useEffect(() => {
    if (!target || target.kind !== 'chord' || phase !== 'waiting') return
    const chord = target.chord
    const required = chord.pitchClasses.length
    if (activeNotes.size < required) return
    const timer = window.setTimeout(() => {
      if (phaseRef.current !== 'waiting' || !readyRef.current) return
      const held = [...activeNotesRef.current]
      if (held.length < required) return
      if (chordMatches(chord, held, settings.smartMode)) {
        succeed()
      } else {
        fail(held)
      }
    }, CHORD_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [activeNotes, target, phase, settings.smartMode, succeed, fail])

  // Virtual keyboard: momentary press in note mode, toggle in chord mode
  const handleVirtualKey = useCallback(
    (midiNote: number) => {
      if (phaseRef.current !== 'waiting') return
      if (settings.mode === 'chord') {
        if (activeNotesRef.current.has(midiNote)) virtualNoteOff(midiNote)
        else virtualNoteOn(midiNote)
      } else {
        virtualNoteOn(midiNote)
        later(() => virtualNoteOff(midiNote), 180)
      }
    },
    [settings.mode, virtualNoteOn, virtualNoteOff, later],
  )

  const keyboardStart = useMemo(() => keyboardWindowFor(targetMidis), [targetMidis])
  const revealNotes = phase === 'reveal' ? targetMidis : []
  const hintNotes =
    target?.kind === 'chord' && settings.chordDisplay === 'keyboard' && phase === 'waiting'
      ? targetMidis
      : []

  return (
    <main className="order-1 flex min-h-dvh min-w-0 flex-1 flex-col lg:order-2 lg:min-h-0">
      {/* Flashcard display */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        {target?.kind === 'note' && (
          <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-sm">
            <MusicSheet clef={target.note.clef} notes={[target.note]} />
          </div>
        )}

        {target?.kind === 'chord' && (
          <div className="flex w-full max-w-lg flex-col items-center gap-4 rounded-xl border bg-card p-8 shadow-sm">
            <ChordSymbol chord={target.chord} />
            {settings.chordDisplay === 'staff' && (
              <MusicSheet
                clef={clefForMidi(target.chord.voicing)}
                notes={chordVexKeys(target.chord)}
                height={180}
              />
            )}
          </div>
        )}

        <StatusBanner
          phase={phase}
          attempts={attempts}
          maxAttempts={settings.maxAttempts}
          isChord={target?.kind === 'chord'}
          noteLabel={target?.kind === 'note' ? target.note.label : undefined}
        />

        <AttemptDots used={attempts} max={settings.maxAttempts} />

        {phase === 'reveal' && (
          <Button size="lg" onClick={advance} autoFocus>
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Virtual keyboard */}
      <div className="border-t bg-card/50 px-6 pb-5 pt-4">
        <div className="mx-auto mb-2 flex max-w-3xl items-center justify-between text-xs text-muted-foreground">
          <span>
            {deviceName ? 'Mirroring your MIDI keyboard' : 'Click keys to play'}
            {!deviceName && settings.mode === 'chord' && ' — clicks toggle keys on/off'}
          </span>
          {card && <span className="tabular-nums">Box {card.box} · Level {card.level}</span>}
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

function ChordSymbol({ chord }: { chord: ChordSpec }) {
  const [main, sub] = chord.symbol.split(' · ')
  return (
    <div className="text-center">
      <div className="text-7xl font-bold tracking-tight">{main}</div>
      {sub && <div className="mt-1 text-sm uppercase tracking-widest text-muted-foreground">{sub}</div>}
    </div>
  )
}

function StatusBanner({
  phase,
  attempts,
  maxAttempts,
  isChord,
  noteLabel,
}: {
  phase: Phase
  attempts: number
  maxAttempts: number
  isChord: boolean
  noteLabel?: string
}) {
  if (phase === 'success') {
    return (
      <div className="flex items-center gap-2 text-emerald-400">
        <CheckCircle2 className="h-5 w-5" />
        <span className="font-medium">Excellent! + Progress</span>
      </div>
    )
  }
  if (phase === 'reveal') {
    return (
      <div className="flex items-center gap-2 text-red-400">
        <XCircle className="h-5 w-5" />
        <span className="font-medium">
          {noteLabel ? `The answer was ${noteLabel} — ` : ''}correct keys highlighted below
        </span>
      </div>
    )
  }
  if (attempts > 0) {
    const left = maxAttempts - attempts
    return (
      <div className="text-amber-400">
        Incorrect! Try again ({left} attempt{left === 1 ? '' : 's'} left)
      </div>
    )
  }
  return (
    <div className="text-muted-foreground">
      {isChord ? 'Play the chord shown above' : 'Play the note shown above'}
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
