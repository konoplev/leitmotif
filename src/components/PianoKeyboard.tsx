import { useMemo } from 'react'
import { isBlackKey, midiToLabel, pitchClass } from '@/lib/music'
import { cn } from '@/lib/utils'

interface PianoKeyboardProps {
  /** First key of the 2-octave window; snapped to a C by the parent */
  startMidi: number
  pressed: ReadonlySet<number>
  /** Keys shown green (revealed answer) */
  reveal: number[]
  /** Keys briefly flashed red after a wrong attempt */
  flash: number[]
  /** Keys outlined as a hint (chord "keyboard hint" display mode) */
  hint: number[]
  onKeyPress: (midi: number) => void
}

const WHITE_W = 44
const WHITE_H = 170
const BLACK_W = 26
const BLACK_H = 106
const KEY_COUNT = 25 // two octaves, C to C

export function PianoKeyboard({
  startMidi,
  pressed,
  reveal,
  flash,
  hint,
  onKeyPress,
}: PianoKeyboardProps) {
  const keys = useMemo(() => {
    const whites: { midi: number; x: number }[] = []
    const blacks: { midi: number; x: number }[] = []
    let whiteIndex = 0
    for (let i = 0; i < KEY_COUNT; i++) {
      const midi = startMidi + i
      if (isBlackKey(midi)) {
        blacks.push({ midi, x: whiteIndex * WHITE_W - BLACK_W / 2 })
      } else {
        whites.push({ midi, x: whiteIndex * WHITE_W })
        whiteIndex++
      }
    }
    return { whites, blacks, totalWidth: whiteIndex * WHITE_W }
  }, [startMidi])

  const stateOf = (midi: number) => {
    if (flash.includes(midi)) return 'flash'
    if (pressed.has(midi)) return 'pressed'
    if (reveal.includes(midi)) return 'reveal'
    if (hint.includes(midi)) return 'hint'
    return 'idle'
  }

  const fillFor = (midi: number, black: boolean) => {
    switch (stateOf(midi)) {
      case 'flash':
        return '#ef4444'
      case 'pressed':
        return '#3b82f6'
      case 'reveal':
        return '#10b981'
      case 'hint':
        return black ? '#1e3a5f' : '#bfdbfe'
      default:
        return black ? '#18181b' : '#fafafa'
    }
  }

  return (
    <svg
      viewBox={`0 0 ${keys.totalWidth} ${WHITE_H}`}
      className="mx-auto block w-full max-w-3xl select-none touch-none"
      role="group"
      aria-label="Virtual piano keyboard"
    >
      {keys.whites.map(({ midi, x }) => (
        <g key={midi} onPointerDown={() => onKeyPress(midi)} className="cursor-pointer">
          <rect
            x={x}
            y={0}
            width={WHITE_W}
            height={WHITE_H}
            fill={fillFor(midi, false)}
            stroke="#3f3f46"
            strokeWidth={1}
            rx={3}
            className={cn('transition-[fill] duration-75')}
          />
          {pitchClass(midi) === 0 && (
            <text
              x={x + WHITE_W / 2}
              y={WHITE_H - 10}
              textAnchor="middle"
              fontSize={11}
              fill={stateOf(midi) === 'idle' ? '#a1a1aa' : '#18181b'}
              pointerEvents="none"
            >
              {midiToLabel(midi)}
            </text>
          )}
        </g>
      ))}
      {keys.blacks.map(({ midi, x }) => (
        <rect
          key={midi}
          x={x}
          y={0}
          width={BLACK_W}
          height={BLACK_H}
          fill={fillFor(midi, true)}
          stroke="#3f3f46"
          strokeWidth={1}
          rx={2}
          onPointerDown={() => onKeyPress(midi)}
          className="cursor-pointer transition-[fill] duration-75"
        />
      ))}
    </svg>
  )
}

/** Choose a C-aligned 2-octave window that contains all target notes. */
export function keyboardWindowFor(targets: number[]): number {
  const DEFAULT_START = 48 // C3
  if (targets.length === 0) return DEFAULT_START
  const lo = Math.min(...targets)
  const hi = Math.max(...targets)
  if (lo >= DEFAULT_START && hi <= DEFAULT_START + KEY_COUNT - 1) return DEFAULT_START
  const start = Math.floor(lo / 12) * 12
  return Math.max(12, Math.min(96, start))
}
