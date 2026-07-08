import { useCallback, useEffect, useRef, useState } from 'react'

export interface MidiState {
  /** Web MIDI API is available in this browser */
  supported: boolean
  /** Name of the first connected input device, if any */
  deviceName: string | null
  /** Currently held MIDI note numbers (real device + virtual keyboard) */
  activeNotes: ReadonlySet<number>
  /** Monotonic counter bumped on every note-on, for edge detection */
  lastNoteOn: { note: number; seq: number } | null
  virtualNoteOn: (note: number) => void
  virtualNoteOff: (note: number) => void
  releaseAllVirtual: () => void
}

const NOTE_ON = 0x90
const NOTE_OFF = 0x80

export function useMidi(): MidiState {
  const [supported, setSupported] = useState(true)
  const [deviceName, setDeviceName] = useState<string | null>(null)
  const [activeNotes, setActiveNotes] = useState<ReadonlySet<number>>(new Set())
  const [lastNoteOn, setLastNoteOn] = useState<{ note: number; seq: number } | null>(null)
  const seqRef = useRef(0)
  const virtualHeld = useRef<Set<number>>(new Set())

  const noteOn = useCallback((note: number) => {
    seqRef.current += 1
    setLastNoteOn({ note, seq: seqRef.current })
    setActiveNotes((prev) => {
      if (prev.has(note)) return prev
      const next = new Set(prev)
      next.add(note)
      return next
    })
  }, [])

  const noteOff = useCallback((note: number) => {
    setActiveNotes((prev) => {
      if (!prev.has(note)) return prev
      const next = new Set(prev)
      next.delete(note)
      return next
    })
  }, [])

  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      setSupported(false)
      return
    }

    let access: MIDIAccess | null = null
    let cancelled = false

    const handleMessage = (event: MIDIMessageEvent) => {
      const data = event.data
      if (!data || data.length < 3) return
      const status = data[0] & 0xf0
      const note = data[1]
      const velocity = data[2]
      if (status === NOTE_ON && velocity > 0) {
        noteOn(note)
      } else if (status === NOTE_OFF || (status === NOTE_ON && velocity === 0)) {
        noteOff(note)
      }
    }

    const bindInputs = () => {
      if (!access) return
      let name: string | null = null
      access.inputs.forEach((input) => {
        input.onmidimessage = handleMessage
        if (!name && input.state === 'connected') name = input.name ?? 'MIDI device'
      })
      setDeviceName(name)
    }

    navigator
      .requestMIDIAccess({ sysex: false })
      .then((midiAccess) => {
        if (cancelled) return
        access = midiAccess
        bindInputs()
        midiAccess.onstatechange = bindInputs
      })
      .catch(() => setSupported(false))

    return () => {
      cancelled = true
      if (access) {
        access.onstatechange = null
        access.inputs.forEach((input) => {
          input.onmidimessage = null
        })
      }
    }
  }, [noteOn, noteOff])

  const virtualNoteOn = useCallback(
    (note: number) => {
      virtualHeld.current.add(note)
      noteOn(note)
    },
    [noteOn],
  )

  const virtualNoteOff = useCallback(
    (note: number) => {
      virtualHeld.current.delete(note)
      noteOff(note)
    },
    [noteOff],
  )

  const releaseAllVirtual = useCallback(() => {
    for (const note of virtualHeld.current) noteOff(note)
    virtualHeld.current.clear()
  }, [noteOff])

  return {
    supported,
    deviceName,
    activeNotes,
    lastNoteOn,
    virtualNoteOn,
    virtualNoteOff,
    releaseAllVirtual,
  }
}
