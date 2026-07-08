import { useEffect, useRef, useState } from 'react'
import { Accidental, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow'
import type { Clef, NoteSpec } from '@/lib/music'

interface MusicSheetProps {
  clef: Clef
  /** Notes rendered as a single chord (one = single note) */
  notes: NoteSpec[]
  height?: number
}

/**
 * VexFlow wrapper. Re-renders on prop changes and container resizes,
 * clearing the previous SVG output before each draw.
 */
export function MusicSheet({ clef, notes, height = 220 }: MusicSheetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (typeof ResizeObserver === 'undefined') {
      // Old WebViews: fall back to window resize events
      const measure = () => setWidth(Math.floor(el.clientWidth))
      measure()
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver((entries) => {
      setWidth(Math.floor(entries[0].contentRect.width))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el || width < 120 || notes.length === 0) return

    el.innerHTML = ''
    const renderer = new Renderer(el, Renderer.Backends.SVG)
    renderer.resize(width, height)
    const context = renderer.getContext()

    const staveWidth = Math.min(width - 20, 360)
    const staveX = Math.max(10, (width - staveWidth) / 2)
    const stave = new Stave(staveX, height / 2 - 60, staveWidth)
    stave.addClef(clef)
    stave.setContext(context).draw()

    const staveNote = new StaveNote({
      clef,
      keys: notes.map((n) => n.vexKey),
      duration: 'w',
    })
    notes.forEach((n, i) => {
      if (n.accidental) staveNote.addModifier(new Accidental(n.accidental), i)
    })

    const voice = new Voice({ num_beats: 4, beat_value: 4 })
    voice.setStrict(false)
    voice.addTickables([staveNote])
    new Formatter().joinVoices([voice]).format([voice], staveWidth - 80)
    voice.draw(context, stave)

    return () => {
      el.innerHTML = ''
    }
  }, [clef, notes, width, height])

  return <div ref={containerRef} className="music-sheet w-full" style={{ minHeight: height }} />
}
