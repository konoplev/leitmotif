Вот готовый, максимально подробный технический регламент (Specification & Architecture Document). Вы можете сохранить этот текст в файл CLAUDE_IMPLEMENTATION_PLAN.md, положить 
его в корень проекта и скормить Claude Code со словами: *«Реализуй проект строго по спецификации в файле CLAUDE_IMPLEMENTATION_PLAN.md»*.

---


# Specification & Implementation Plan: Web MIDI Trainer (SPA)

This document contains the complete blueprint for building a static, single-page web application for learning musical notes and chords using a MIDI keyboard. The application 
requires no backend, runs completely in the browser, features a modern UI, and uses an interval-repetition system (`localStorage`) to manage the learning progression.

---

## 1. Tech Stack & Architecture

* **Framework:** React 19 + TypeScript + Vite
* **Styling:** Tailwind CSS (Modern, dark-themed, minimalist dashboard like Linear/Vercel)
* **UI Components:** Shadcn/ui (Radix Primitives) — Tabs, Dialog, Slider, Switch, Toast
* **Music Rendering:** VexFlow (v4+) for rendering standard musical notation (staves, clefs, notes)
* **Icons:** Lucide React
* **State & Storage:** React Context API + Browser `localStorage`

---

## 2. Core Modules & Specifications

### 2.1 Web MIDI API Integration (`src/hooks/useMidi.ts`)
* **Initialization:** On mount, request MIDI access using `navigator.requestMIDIAccess({ sysex: false })`.
* **Device Management:** * Track connected MIDI input devices.
    * Listen to `statechange` events to handle hot-plugging/disconnecting of keyboards.
* **Event Handling:** * Parse incoming MIDI messages. Focus on `0x90` (Note On) and `0x80` (Note Off).
    * Account for `Note On` with velocity `0` as a `Note Off`.
* **State Output:** Maintain an array/set of currently active (pressed) MIDI note numbers (e.g., `[60, 64, 67]`) in real time.
* **Fallback Mode:** If no MIDI device is connected, mouse/touch clicks on the virtual on-screen keyboard must simulate MIDI inputs.

### 2.2 Interval Repetition System (Leitner Algorithm)
To prevent cognitive overload, flashcards (individual notes or chords) are grouped into 5 progressive Boxes inside `localStorage`.

* **Card Structure:**
    ```typescript
    interface FlashCard {
      id: string; // e.g., "C4", "Am_root"
      type: 'note' | 'chord';
      box: number; // 1 to 5
      nextReview: string; // ISO Timestamp
      data: any; // Meta info for rendering
    }
    
* Progression Rules (Based on Configurable Max Attempts, default = 2):
    * Success on 1st Attempt: Card moves to box = min(5, box + 1). nextReview is set to $CurrentTime + (box \times 5 \text{ minutes})$.
    * Success on 2nd to Max Attempt: Card stays in the current box. nextReview is set to $CurrentTime + 1 \text{ minute}$.
    * Failure (Attempts Exhausted): Card drops to box = 1. nextReview is set immediately (pushed to front of queue).

### 2.3 Note & Chord Theory Engine
* Note Mapping: MIDI note 60 = C4 (Middle C). Range to support: A0 (21) to C8 (108).
* Level Groups for Notes:
    * *Level 1:* C4, D4, E4, F4, G4 (Treble Clef, Right Hand start)
    * *Level 2:* C4 to B4 (Full C Major scale, Treble)
    * *Level 3:* C3 to B3 (Bass Clef, Left Hand start)
    * *Level 4:* Accidentals (Sharps/Flats in Middle Octave)
    * *Level 5:* Full Keyboard range.
* Level Groups for Chords:
    * *Level 1:* C, F, G (Basic Triads, Major)
    * *Level 2:* Am, Dm, Em (Basic Triads, Minor)
    * *Level 3:* All white-key triads (including Bdim)
    * *Level 4:* Inversions (First and Second inversions of basic chords)
    * *Level 5:* Seventh chords (C7, G7, Am7)

* Chord Validation Modes:
    1.  *Strict Mode:* Checks the exact voicing and inversion requested.
    2.  *Smart Mode:* Validates pitch classes. If "C Major" is requested, any simultaneous combination of C, E, and G keys across any octave is accepted as correct.

---

## 3. UI/UX Component Specifications

The application consists of a single dashboard view split into a Sidebar (Settings) and a Main Work Area.

### 3.1 Sidebar (Control Panel)
* Connection Status Indicator: A pulsing badge. Green with device name if connected (e.g., `● Roland FP-30X`), amber if listening but no device found (`● Waiting for MIDI... 
Virtual Keyboard active`).
* Mode Selector: Tabs or toggle for "Note Training" vs "Chord Training".
* Level Selector: Grid of buttons/checkboxes allowing users to toggle active learning levels.
* Settings Form:
    * *Max Attempts:* Slider/Input (Range 1-5, default 2).
    * *Chord Display Mode:* Dropdown ("Show on Staff", "Show Letters Only", "Show Keyboard Hint").
    * *Smart Evaluation:* Switch/Toggle (On/Off).
* Progress Reset: A button triggering a confirmation Dialog to clear localStorage.

### 3.2 Main Training View
* Flashcard Display Area: Large central container.
    * *Note Mode:* Renders a VexFlow canvas displaying a single staff (Treble or Bass based on level) with the target note.
    * *Chord Mode:* Renders the Chord Symbol (e.g., **D7**) in massive typography, optionally showing the notes on a staff or hiding them depending on settings.
* Feedback & Attempt Tracker:
    * Displays current attempt dots (e.g., ◯ ◯ changing to ⬤ ◯ on error).
    * Status banners: "Play the note shown above...", "Incorrect! Try again (1 attempt left)", "Excellent! (+ Progress)".
* Virtual Keyboard Visualizer:
    * An interactive SVG/CSS 2-octave piano keyboard anchored at the bottom.
    * *Blue Highlight:* Keys currently being pressed by the user on their real MIDI device.
    * *Red Flash:* Triggered on incorrect input submissions.
    * *Green Highlight (Revealed on Failure):* Shows the correct keys when max attempts are exhausted. Includes a "Next" button to advance.

---

## 4. State Machine & Game Loop

For each flashcard prompt, the system flows through these exact states:




[1. IDLE/GENERATE]
│
▼ Fetch next due card from active levels
[2. WAITING FOR INPUT] ──(User plays keys)
│
├──► Match? ──YES──► [3. SUCCESS ANIMATION] ──► Move Box Up ──► Loop to 1
│
└──► Mismatch? ──NO
│
▼
Increment Attempts
│
├──► Current < Max? ──► [4. RETRY SCREEN] ──► Loop to 2
│
└──► Current >= Max? ──► [5. REVEAL ANSWER] ──► Move Box to 1 ──► Wait for "Next" click



---

## 5. Implementation Phases for Claude Code

### Phase 1: Environment & Layout Setup
1. Scaffold the Vite React TypeScript environment.
2. Configure Tailwind CSS with a dark monochromatic theme.
3. Build the sidebar, main layout container, responsive wrappers, and the interactive SVG/CSS virtual piano keyboard component.

### Phase 2: Web MIDI & Data Persistence Enginering
1. Write the useMidi hook. Hook up the active notes array directly to the virtual keyboard component so playing the MIDI keyboard illuminates keys in real time.
2. Implement the localStorage database handlers and the Leitner Box queue calculations. Ensure active card state can be loaded and saved seamlessly.

### Phase 3: Music Notation Engine (`VexFlow`)
1. Create a dynamic <MusicSheet /> wrapper component for VexFlow.
2. Ensure it handles window resizing cleanly, clears the canvas before redraws, renders both Treble and Bass clefs, and supports accidentals (sharps, flats).

### Phase 4: Core Validation Logic & Game Loop
1. Implement the Note matching function (direct MIDI number check).
2. Implement Chord checking logic (including pitch class arrays for the "Smart Evaluation" mode).
3. Connect the validation logic to the layout, triggering state transformations, attempt updates, toast notifications, and color flashes based on inputs.

### Phase 5: Verification & Edge-Case Polishing
1. Gracefully handle chords where notes are pressed milliseconds apart (implement a brief debounce window, e.g., 50-80ms, before checking chord completion).
2. Ensure flawless virtual keyboard click handling for manual testing without physical hardware.
3. Optimize build performance for zero-error generation during npm run build.

---

## 6. Verification Checklist (Definition of Done)
* App compiles to entirely static assets (`dist/` folder containing index.html, JS, CSS).
* Plugging in a MIDI keyboard updates the interface connection state without refreshing the page.
* Playing keys reflects instantly on screen (latency < 16ms).
* Failing a card multiple times accurately drops its Leitner status and highlights the correct answer in green.


