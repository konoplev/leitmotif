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

    // Pre-standard shims (e.g. the iOS Web MIDI Browser app's cwilso-derived
    // polyfill) expose inputs as a Map-like whose values() returns an object
    // with only .next() (no Symbol.iterator, so for...of/spread throw), or as
    // a function/array-like — and may omit `state`. Their forEach(port) is
    // call-compatible with the real Map's forEach(value, ...), so prefer it.
    const listInputs = (a: MIDIAccess): MIDIInput[] => {
      const raw =
        typeof (a as { inputs: unknown }).inputs === 'function'
          ? (a as unknown as { inputs: () => unknown }).inputs()
          : a.inputs
      if (!raw) return []
      const out: MIDIInput[] = []
      const anyRaw = raw as {
        forEach?: (cb: (v: MIDIInput) => void) => void
        values?: () => { next: () => { value?: MIDIInput; done?: boolean } }
        length?: number
      }
      if (typeof anyRaw.forEach === 'function') {
        anyRaw.forEach((input) => out.push(input))
      } else if (typeof anyRaw.values === 'function') {
        const it = anyRaw.values()
        for (let r = it.next(); !r.done; r = it.next()) {
          if (r.value) out.push(r.value)
        }
      } else if (typeof anyRaw.length === 'number') {
        for (let i = 0; i < anyRaw.length; i++) out.push((raw as MIDIInput[])[i])
      }
      return out
    }

    const bindInputs = () => {
      if (!access) return
      // Never throw: this runs inside the shim's own callback chain, where an
      // exception would silently kill the whole success path
      try {
        let name: string | null = null
        for (const input of listInputs(access)) {
          input.onmidimessage = handleMessage
          if (!name && input.state !== 'disconnected') name = input.name ?? 'MIDI device'
        }
        setDeviceName(name)
      } catch {
        setDeviceName(null)
      }
    }

    const onAccess = (midiAccess: MIDIAccess) => {
      if (cancelled) return
      access = midiAccess
      bindInputs()
      try {
        midiAccess.onstatechange = bindInputs
      } catch {
        // shim without statechange support
      }
    }

    // The standard API returns a Promise. Old wrapper-app shims (e.g. the iOS
    // Web MIDI Browser, which injects the pre-Promise cwilso shim) return a
    // homemade thenable whose .then() itself returns undefined — so pass both
    // handlers into then() and never chain, or fall back to the 2012-draft
    // (successCallback, errorCallback) form if there is no thenable at all
    try {
      const result = navigator.requestMIDIAccess({ sysex: false }) as unknown
      const thenable = result as { then?: unknown } | null | undefined
      if (thenable && typeof thenable.then === 'function') {
        ;(thenable as { then: (ok: (a: MIDIAccess) => void, err: () => void) => unknown }).then(
          onAccess,
          () => setSupported(false),
        )
      } else {
        ;(
          navigator.requestMIDIAccess as unknown as (
            ok: (a: MIDIAccess) => void,
            err: () => void,
          ) => void
        )(onAccess, () => setSupported(false))
      }
    } catch {
      setSupported(false)
    }

    return () => {
      cancelled = true
      if (access) {
        try {
          access.onstatechange = null
          for (const input of listInputs(access)) {
            input.onmidimessage = null
          }
        } catch {
          // best effort on shims
        }
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
