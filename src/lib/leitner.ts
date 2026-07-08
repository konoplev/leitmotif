// Leitner interval-repetition system persisted in localStorage.
// Cards live in boxes 1-5; correct answers promote, exhausted attempts demote to box 1.

import { CHORD_LEVELS, NOTE_LEVELS } from './music'

export interface FlashCard {
  id: string
  type: 'note' | 'chord'
  level: number
  box: number // 1 to 5
  nextReview: string // ISO timestamp
}

const STORAGE_KEY = 'leitmotif_cards_v1'
const MINUTE = 60_000

type CardMap = Record<string, FlashCard>

function loadAll(): CardMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CardMap) : {}
  } catch {
    return {}
  }
}

function saveAll(cards: CardMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards))
  } catch {
    // Storage disabled (some WebViews / private mode): train without persistence
  }
}

export function resetProgress(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

function cardIdsForLevels(type: 'note' | 'chord', levels: number[]): { id: string; level: number }[] {
  if (type === 'note') {
    return levels.flatMap((lvl) =>
      (NOTE_LEVELS[lvl]?.notes ?? []).map((n) => ({ id: n.id, level: lvl })),
    )
  }
  return levels.flatMap((lvl) =>
    (CHORD_LEVELS[lvl]?.chords ?? []).map((c) => ({ id: c.id, level: lvl })),
  )
}

/** Ensure cards exist for every item in the active levels; returns the active deck. */
export function getDeck(type: 'note' | 'chord', levels: number[]): FlashCard[] {
  const all = loadAll()
  let dirty = false
  // The same card can appear in several levels (e.g. C4 in note levels 1, 2, 5)
  const wanted = [...new Map(cardIdsForLevels(type, levels).map((w) => [w.id, w])).values()]
  for (const { id, level } of wanted) {
    if (!all[id]) {
      all[id] = { id, type, level, box: 1, nextReview: new Date(0).toISOString() }
      dirty = true
    }
  }
  if (dirty) saveAll(all)
  return wanted.map(({ id }) => all[id])
}

/**
 * Pick the next card: prefer due cards (random among them), otherwise review
 * ahead with the card whose nextReview is soonest. Avoids immediately
 * repeating the previous card when the deck has alternatives.
 */
export function pickNextCard(deck: FlashCard[], excludeId?: string): FlashCard | null {
  if (deck.length === 0) return null
  let pool = deck.length > 1 && excludeId ? deck.filter((c) => c.id !== excludeId) : deck
  const now = Date.now()
  const due = pool.filter((c) => Date.parse(c.nextReview) <= now)
  if (due.length > 0) {
    return due[Math.floor(Math.random() * due.length)]
  }
  pool = [...pool].sort((a, b) => Date.parse(a.nextReview) - Date.parse(b.nextReview))
  return pool[0]
}

export function dueCount(deck: FlashCard[]): number {
  const now = Date.now()
  return deck.filter((c) => Date.parse(c.nextReview) <= now).length
}

/** Success on the 1st attempt: box up, review in (new box × 5) minutes. */
export function promoteCard(card: FlashCard): FlashCard {
  const box = Math.min(5, card.box + 1)
  return update(card, box, box * 5 * MINUTE)
}

/** Success on a later attempt: stay in place, review again in 1 minute. */
export function retainCard(card: FlashCard): FlashCard {
  return update(card, card.box, MINUTE)
}

/** Attempts exhausted: drop to box 1, due immediately. */
export function demoteCard(card: FlashCard): FlashCard {
  return update(card, 1, 0)
}

function update(card: FlashCard, box: number, delayMs: number): FlashCard {
  const next: FlashCard = {
    ...card,
    box,
    nextReview: new Date(Date.now() + delayMs).toISOString(),
  }
  const all = loadAll()
  all[card.id] = next
  saveAll(all)
  return next
}

export function boxDistribution(deck: FlashCard[]): number[] {
  const dist = [0, 0, 0, 0, 0]
  for (const c of deck) dist[Math.min(4, Math.max(0, c.box - 1))]++
  return dist
}
