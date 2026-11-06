# Flashcard — UI Specification (UISPEC)

**Status:** Draft · **Version:** 1.0.0 · **Last updated:** 2026-11-05
**References:** PRD v1.0.x (`PR-xx`); behavior is defined in the DEVSPEC (`FR-xx`) and **wins** on any conflict. This document defines every screen, state, visibility rule, interaction threshold, and acceptance criterion (Gherkin). Fixtures named in scenarios (`animals`, `english`, card ids) are defined in the TESTSPEC.

> Status values: `Draft` → `Approved` → `Implemented`.

---

## U.1 Screen inventory

| ID | Screen | Shown when | Tier |
|---|---|---|---|
| S-1 | Loading | Boot in progress (FR-10) | MVP |
| S-2 | Error (E1/E2/E3/E9) | Unusable params/deck data/unhandled error (DEVSPEC §II.4) | MVP |
| S-3 | Card (single) | Ready; MVP shows card 0 only; Better adds S-4 controls | MVP |
| S-4 | Card + arrows | Ready, Better milestone only | Better |
| S-5 | Carousel | Ready, Great (release) | Great |

There are no menus, settings, text inputs, dialogs, or navigation chrome. The game fills the WebView viewport. **Minimum supported viewport: 360 × 360 CSS px**, portrait or landscape.

## U.2 Design tokens and canonical presentation constants

Single source of truth for presentation values (other documents refer to the **names**).

### Colors and type

| Token | Value |
|---|---|
| `--bg` | `#EAF4FF` |
| `--card-border` | `#2B4C7E`, width **4 px**, radius **16 px** |
| `--card-front-bg` | `#FFFFFF` |
| `--card-back-bg` | `#FFF4CC` |
| `--word-color` | `#1B1B1B` (contrast ≥ 7:1 on back bg) |
| `--placeholder-bg` | `#E0E0E0` |
| `--focus-ring` | `#FF8A00`, 3 px solid, 2 px offset |
| `--shadow` | `0 4px 12px rgba(0,0,0,0.25)` |
| Font | bundled Noto Sans (Latin + Latin Extended), fallback `system-ui, sans-serif`; word weight Bold |

### Geometry

| Name | Value |
|---|---|
| `CARD_ASPECT` | 4 : 3 (width : height) |
| `CENTER_VW_FRAC` | 0.78 (of viewport width) |
| `CENTER_VH_FRAC` | 0.7 (max card height as fraction of viewport height) |
| `CENTER_MAX_PX` | 720 (max card width) |
| `SIDE_SCALE` | 0.8 |
| `SIDE_OPACITY` | 0.6 |
| `SIDE_GAP_PX` | 12 |
| `MIN_SLIVER_PX` | 24 (guaranteed visible width of each peek at ≥ 360 px viewport width) |
| `IMAGE_PAD_PX` | 8 (inner padding of the image area) |
| `WORD_FIT_FRAC` | 0.84 of card width (max word width) |
| `WORD_START_FRAC` | 0.22 of card height (starting word font size) |
| `WORD_MIN_PX` | 18 |
| `ARROW_SIZE_PX` | 56 (Better only); gap to card 16; gap between arrows 32 |
| `MIN_TARGET_PX` | 44 |

### Timing and gesture thresholds

| Name | Value |
|---|---|
| `FLIP_MS` | 400 (ease-in-out) |
| `SLIDE_MS` | 300 (`cubic-bezier(0.2, 0.8, 0.2, 1)`) |
| `TAP_MAX_MOVE_PX` | 10 |
| `TAP_MAX_MS` | 500 |
| `SWIPE_MIN_DX_PX` | 48 |
| `SWIPE_MIN_VX` | 0.4 px/ms (average over the gesture) |
| `SWIPE_VELOCITY_MIN_DX_PX` | 16 (minimum travel for a velocity-based swipe) |
| `RUBBER_BAND` | 0.3 (drag factor when no neighbour exists in the drag direction) |
| `PERSPECTIVE_PX` | 1000 |

## U.3 S-1 Loading

- Full-viewport `--bg`; centered 48 px CSS spinner (1 s linear rotation). **No text.**
- `role="status"`, accessible name "Loading".
- Replaced by S-3/S-4/S-5 or S-2. Reduced motion: spinner is static (a pulsing opacity is also disabled).

## U.4 S-2 Error

- Full-viewport `--bg`; centered 64 px "!" icon in a circle (`--card-border` color) and the **code** below it in 24 px Bold (`E1`, `E2`, `E3`, `E9`).
- `role="alert"`, name "Content unavailable, code E#". No buttons (the container controls relaunch).

| Code | Meaning (DEVSPEC §II.4) |
|---|---|
| E1 | Launch parameters missing/invalid |
| E2 | Deck/words data could not be loaded or is invalid |
| E3 | No playable cards |
| E9 | Unexpected runtime error |

## U.5 Card component

A card is a bordered rectangle of `Wc × Hc` (see §U.7 for `Wc`, `Hc`), with a two-faced 3D structure: `.card` (perspective wrapper) > `.card-inner` (rotates) > `.face-front` + `.face-back`.

```
┌────────────────────────┐   border 4px #2B4C7E, radius 16, shadow
│  ┌──────────────────┐  │   IMAGE_PAD_PX padding
│  │                  │  │
│  │   image (contain)│  │   FRONT: <img> object-fit: contain,
│  │                  │  │   centered, never cropped or distorted,
│  └──────────────────┘  │   scales up or down to fit
└────────────────────────┘

┌────────────────────────┐
│                        │   BACK: --card-back-bg; word text only,
│       Alligator        │   centered H+V, Bold, --word-color
│                        │
└────────────────────────┘
```

| Rule | Spec |
|---|---|
| Front face | image only; `alt=""` (decorative; the card's accessible name carries the semantics, §U.10); `draggable=false` |
| Back face | the `word` text only; **no image** |
| Word fitting | start at `WORD_START_FRAC × Hc`; reduce by 2 px steps until the single-line width ≤ `WORD_FIT_FRAC × Wc` or `WORD_MIN_PX`; below that, allow wrapping (`overflow-wrap: anywhere`), vertically centered |
| Image failure | front shows `--placeholder-bg` with a centered 48 px inline-SVG "picture" icon; card stays fully operable |
| Peek (side) cards | front face only, regardless of previous flip history |
| Interaction | tap/click/Enter/Space on the **current** card flips it (DEVSPEC FR-15/FR-16) |

**MVP/Better (S-3/S-4):** single card centered. **S-4:** adds two arrow buttons (§U.6).

## U.6 S-4 Arrow navigation (Better only; deleted at Great — AC-17)

Content block = card + 16 px gap + arrows row, vertically centered in the viewport. Arrows row: two circular `ARROW_SIZE_PX` buttons, `--card-border` fill, white chevron icon (inline SVG), 32 px apart, centered horizontally. Accessible names "Previous card" / "Next card". **Disabled** at the first/last card: 30% opacity, `aria-disabled="true"`, no action.

## U.7 S-5 Carousel layout (normative geometry)

`computeLayout(vw, vh)` (pure function, unit-tested with vectors in the TESTSPEC):

```
Wc  = floor( min( CENTER_VW_FRAC·vw,  CENTER_VH_FRAC·vh·(4/3),  CENTER_MAX_PX ) )
Hc  = floor( Wc · 3/4 )
Ws  = floor( Wc · SIDE_SCALE ),  Hs = floor( Hc · SIDE_SCALE )
cx0 = vw / 2                              (current card center-x)
cx+1 = cx0 + Wc/2 + SIDE_GAP_PX + Ws/2    (next card center-x);  cx−1 mirrored
cx±2 = cx±1 ± (Ws + SIDE_GAP_PX)          (off-screen staging slots)
cy  = vh / 2                              (all cards centered vertically)
sliver = vw − (cx0 + Wc/2 + SIDE_GAP_PX)  (visible width of each peek)
```

Slot index: `0` current, `±1` peeks, `±2` staging (rendered, off-screen, so slides never reveal an empty slot). Render window = current ±2 (clipped to existing cards). Peek cards are drawn at `SIDE_SCALE` and `SIDE_OPACITY`; z-order: current on top.

```
┌──────────────────────────────────────────┐
│ ┌──┐   ┌──────────────────┐   ┌──┐       │
│ │▒▒│   │                  │   │▒▒│       │   peeks clipped by the viewport,
│ │▒▒│   │   CURRENT CARD   │   │▒▒│       │   ≥ MIN_SLIVER_PX visible each
│ └──┘   └──────────────────┘   └──┘       │
└──────────────────────────────────────────┘
```

Worked vectors: 360×640 → Wc 280, Hc 210, sliver 28 · 640×360 → Wc 336, Hc 252, sliver 140 · 1280×800 → Wc 720, Hc 540, sliver 268.

Rules: no peek where there is no neighbour (first card: no left peek; last card: no right peek). No horizontal page scroll at any viewport (`overflow: hidden` on the root). On resize/orientation change, layout is recomputed; current card and face are preserved with no animation.

## U.8 Gestures (Pointer Events; carousel region)

`touch-action: none; user-select: none; -webkit-tap-highlight-color: transparent`. Only the first active pointer is tracked; extra pointers are ignored. Use `setPointerCapture`.

Classification on `pointerup` (start `(x0,y0,t0)`, end `(x1,y1,t1)`; `dx = x1−x0`, `dy = y1−y0`, `dt = t1−t0`; `maxMove` = largest distance from the start during the gesture):

| Result | Condition (evaluated in this order) |
|---|---|
| **tap** | `maxMove < TAP_MAX_MOVE_PX` **and** `dt < TAP_MAX_MS` |
| **swipe** | `|dx| > |dy|` **and** ( `|dx| ≥ SWIPE_MIN_DX_PX` **or** ( `|dx|/dt ≥ SWIPE_MIN_VX` **and** `|dx| ≥ SWIPE_VELOCITY_MIN_DX_PX` ) ) |
| **cancel** | anything else (including long press without movement, vertical-dominant moves, `pointercancel`) |

- Swipe direction: `dx < 0` → next card; `dx > 0` → previous card. Exactly **one** card per swipe.
- During a drag the whole card group follows the finger 1:1. If there is no neighbour in the drag direction the displacement is multiplied by `RUBBER_BAND`. On release: swipe → slide to the new card (`SLIDE_MS`); cancel or no-neighbour → snap back (`SLIDE_MS`).
- Tap routing by the slot under the **pointerdown** target: slot `0` → flip; slot `−1`/`+1` → go to that card (no flip); anything else → ignored.
- Better/MVP: only tap-to-flip applies (no swipe, no peeks).

## U.9 Animations

| Animation | Spec |
|---|---|
| Flip | `.card-inner` transitions `transform` between `rotateY(0)` and `rotateY(180deg)` over `FLIP_MS`; `.card` has `perspective: PERSPECTIVE_PX`; both faces `backface-visibility: hidden` (with `-webkit-` prefix); `.face-back` is pre-rotated `rotateY(180deg)`. Audio starts at flip start (FR-13). |
| Slide | Slot transforms (translate+scale) and peek opacity animate over `SLIDE_MS`. |
| Leaving card on navigation | its face is reset to front **instantly** (no flip animation) as it slides away. |
| Input lock | slide running → all pointer/keyboard input ignored; flip running → taps on the current card ignored (swipes and peek taps are still accepted). |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` and the JS equivalent: `FLIP_MS = SLIDE_MS = 0`, no input lock, faces swap instantly. |
| Style mechanism | dynamic values are applied through CSSOM (`element.style`) or CSS classes; no inline `style=""` in static HTML; no `<style>` tag injection (DEVSPEC §II.5). |

## U.10 Accessibility

| Element | Role / name | Notes |
|---|---|---|
| Current card | `role="button"`, `tabindex="0"`; name front: "Card {n} of {total}. Activate to reveal the word." · back: "{word}. Card {n} of {total}. Activate to flip back." | inactive face `aria-hidden="true"` |
| Peek cards | `role="button"`, `tabindex="0"`; "Previous card" / "Next card" | |
| Live region | visually hidden `aria-live="polite"` announcing the `word` on each reveal | |
| Keyboard | `Enter`/`Space` flip the focused current card; `ArrowLeft`/`ArrowRight` previous/next (DEVSPEC FR-23); Better: arrow buttons are native `<button>`s | keys ignored while the input lock is active |
| Focus | visible `--focus-ring` on every focusable element | |
| Targets | every interactive element ≥ `MIN_TARGET_PX` in both dimensions (peek slivers are exempt from the width rule but the full card height remains hittable) | |
| Strings | all app-owned strings (labels, error codes) live in one `strings.ts` table | |

## U.11 Visibility matrix and interaction state machine

| Element | S-1 | S-2 | S-3 (MVP) | S-4 (Better) | S-5 (Great) |
|---|---|---|---|---|---|
| Spinner | ✔ | | | | |
| Error icon + code | | ✔ | | | |
| Current card | | | ✔ (card 0) | ✔ | ✔ |
| Peek cards | | | | | ✔ (if neighbour exists) |
| Arrow buttons | | | | ✔ (disabled at ends) | ✘ (must not exist) |
| Live region | | | ✔ | ✔ | ✔ |

**States of the ready screen** (`face` ∈ front/back; modifiers: *Flipping*, *Sliding*, *Dragging*):

| State | Event | Next state | Side effects |
|---|---|---|---|
| Front, idle | tap current | Back + Flipping | audio play at t=0; live-region word |
| Back, idle | tap current (Better+) | Front + Flipping | audio stop |
| Back, idle (MVP only) | tap current | Back (no change) | — |
| Any idle | swipe / tap peek / arrow / key | New card, Front + Sliding | audio stop; progress saved; old card reset to front |
| Flipping | tap current | unchanged | ignored |
| Flipping | swipe / peek tap | New card + Sliding | leaving card reset instantly |
| Sliding | any input | unchanged | ignored |
| Any idle | pointerdown + move > `TAP_MAX_MOVE_PX` | Dragging | group follows finger |
| Dragging | release | per §U.8 | snap/slide |
| Any | resize/orientation | same | layout recomputed, no animation |

---

## U.12 Acceptance criteria (Gherkin)

Common background: `Given the "animals" deck with the "english" language pack is installed and the app is launched at a 360×640 viewport`. Tags: tier and the verified `FR`.

```gherkin
Feature: Loading and error screens

  @MVP @FR-10
  Scenario: AC-01 Loading screen is shown until ready
    When the app starts
    Then the loading screen (S-1) is visible with a spinner and no text
    And it is replaced by a card within 10 seconds with the network off

  @MVP @FR-03
  Scenario: AC-02 Missing launch parameters
    When the app is launched without "cr_lang"
    Then the error screen shows code "E1"
    And no deck file is requested

  @MVP @FR-10
  Scenario: AC-03 Deck data cannot be loaded
    Given the words file for the language is missing
    Then the error screen shows code "E2"

  @MVP @FR-09
  Scenario: AC-04 No playable cards
    Given no card in "card_order" has a words entry
    Then the error screen shows code "E3"

Feature: Card face (MVP)

  @MVP @FR-14
  Scenario: AC-05 Initial front face
    When the card is ready
    Then a bordered rectangle shows the image of the first card in "card_order"
    And no word text is visible

  @MVP @FR-14
  Scenario Outline: AC-06 Images are resized to fit without distortion
    Given the current card's image is <shape>
    Then the whole image is visible inside the card's image area
    And its aspect ratio is unchanged
    And it is neither cropped nor stretched
    Examples:
      | shape                   |
      | landscape 800x600       |
      | portrait 600x800        |
      | very wide 1200x300      |
      | small 200x200           |

  @MVP @FR-15
  Scenario: AC-07 Tap reveals the word and plays audio
    When I tap the card
    Then the card shows the written word "Alligator" and no image
    And the audio for "alligator" starts playing exactly once

  @MVP @FR-14
  Scenario: AC-08 Long words fit the card
    Given a card whose target word is 40 characters long
    When I reveal it
    Then the whole word is visible inside the card
    And the font size is not below 18 px unless the text wraps

  @MVP @FR-14 @FR-06
  Scenario: AC-09 Missing image does not block the card
    Given the image for the current card cannot be loaded
    Then the placeholder is shown on the front
    And tapping still reveals the word

  @MVP @FR-13
  Scenario: AC-10 Missing audio is silent
    Given the audio for the current card is missing
    When I tap the card
    Then the word is shown and no error is displayed

Feature: Flip back and forth (Better)

  @Better @FR-16
  Scenario: AC-11 Tapping the back returns to the front without audio
    Given the card is showing its word
    When I tap the card
    Then the image is shown again
    And no audio starts

  @Better @FR-16
  Scenario: AC-12 Unlimited flipping
    When I tap the card 10 times, waiting for each flip to finish
    Then the card has alternated front/back each time
    And audio started exactly 5 times (once per reveal)

Feature: Arrow navigation (Better)

  @Better @FR-17 @FR-11
  Scenario: AC-13 Arrows move between cards and reset the face
    Given the card "alligator" is showing its word
    When I press "Next card"
    Then the second card "bear" is shown on its front face
    And any playing audio stops

  @Better @FR-17
  Scenario: AC-14 Arrows are disabled at the ends
    Given the first card is current
    Then "Previous card" is disabled
    When the last card is current
    Then "Next card" is disabled

Feature: Carousel (Great)

  @Great @FR-18
  Scenario: AC-15 Current card with a peek on each side
    Given the third card "cat" is current
    Then "cat" is fully visible and centered
    And a portion of "bear" is visible to the left and a portion of "dog" to the right
    And each visible portion is at least 24 px wide
    And the peeks are scaled to 80% and drawn at 60% opacity on their front faces

  @Great @FR-18
  Scenario: AC-16 No peek where there is no neighbour
    Given the first card is current
    Then no card is shown on the left
    When the last card is current
    Then no card is shown on the right

  @Great @FR-17
  Scenario: AC-17 Arrow buttons do not exist
    Then no "Previous card" or "Next card" button is in the page

  @Great @FR-19
  Scenario: AC-18 Tapping the right peek moves forward
    Given "cat" is current
    When I tap the right peek
    Then "dog" becomes current on its front face
    And the carousel slides so a new right peek ("elephant") appears
    And "dog" was not flipped

  @Great @FR-19
  Scenario: AC-19 Tapping the left peek moves backward
    Given "cat" is current
    When I tap the left peek
    Then "bear" becomes current on its front face

  @Great @FR-20
  Scenario: AC-20 Swiping moves one card
    Given "cat" is current
    When I swipe left by 120 px
    Then "dog" is current
    When I swipe right by 120 px
    Then "cat" is current

  @Great @FR-20
  Scenario: AC-21 Swiping past the ends rubber-bands back
    Given the first card is current
    When I swipe right by 120 px
    Then the group follows the finger at 30% displacement
    And the first card is still current after release

  @Great @FR-20
  Scenario: AC-22 Short slow drag cancels
    Given "cat" is current
    When I drag 30 px left slowly over 600 ms and release
    Then "cat" is still current and the group snaps back

  @Great @FR-20
  Scenario: AC-23 Fast flick navigates
    Given "cat" is current
    When I flick left 24 px in 40 ms
    Then "dog" is current

  @Great @FR-20
  Scenario: AC-24 Vertical-dominant gestures are ignored
    Given "cat" is current
    When I drag 60 px down and 40 px left
    Then "cat" is still current

  @Great @FR-20
  Scenario: AC-25 Movement of 10 px or more is not a tap
    Given "cat" is current on its front
    When I press on the card, move 12 px and release within 100 ms
    Then the card did not flip

Feature: Animation and input lock (Great)

  @Great @FR-21
  Scenario: AC-26 Flip is animated
    When I tap the current card
    Then the card rotates about its vertical axis over 400 ms
    And the word becomes visible when the rotation passes 90 degrees

  @Great @FR-22
  Scenario: AC-27 Taps during a flip are ignored
    When I tap the card and tap again 100 ms later
    Then the card completes a single flip to its back

  @Great @FR-22
  Scenario: AC-28 Input during a slide is ignored
    When I tap the right peek and tap the new right peek 100 ms later
    Then only one card advance occurred

  @Great @FR-22
  Scenario: AC-29 Navigating during a flip resets the leaving card
    Given I tapped the current card and the flip is running
    When I swipe left
    Then the next card is current on its front
    And the previous card is on its front when I come back to it

  @Great @FR-22
  Scenario: AC-30 Reduced motion
    Given the system prefers reduced motion
    When I tap the card
    Then the word appears immediately with no animation
    And rapid consecutive taps are all honoured

Feature: Layout

  @Great @FR-18
  Scenario Outline: AC-31 Geometry at supported viewports
    Given the viewport is <w> by <h>
    Then the current card is <wc> by <hc> and each peek is at least 24 px wide
    And the page has no horizontal scroll
    Examples:
      | w    | h   | wc  | hc  |
      | 360  | 640 | 280 | 210 |
      | 640  | 360 | 336 | 252 |
      | 1280 | 800 | 720 | 540 |

  @Great @FR-18
  Scenario: AC-32 Rotation keeps state
    Given "dog" is current and showing its word
    When the viewport changes from 360x640 to 640x360
    Then "dog" is still current and still showing its word
    And the layout matches the new geometry

Feature: Accessibility

  @Quality @FR-23
  Scenario: AC-33 Keyboard operation
    Given the current card has focus
    When I press Enter
    Then the card flips
    When I press ArrowRight
    Then the next card becomes current

  @Quality @FR-23
  Scenario: AC-34 Accessible names
    Then the current card exposes the name "Card 1 of 5. Activate to reveal the word."
    And after revealing, a live region announces "Alligator"
    And the hidden face has aria-hidden="true"

  @Quality @FR-23
  Scenario: AC-35 Focus and targets
    Then every interactive element shows a visible focus ring when focused
    And is at least 44 px tall

Feature: Resume

  @Better @FR-12
  Scenario: AC-36 Resume on the last card
    Given I navigated to "dog" and reloaded the app
    Then "dog" is current on its front face
    And if the saved card no longer exists, the first card is current
```

---

## Spec change log
<!-- Newest first. Format: 2026-MM-DD — <author> — <one-sentence description of change> -->

2026-11-05 — Copilot — Initial draft of the UISPEC with screens, tokens, geometry, gestures, animations, accessibility, state machine, and Gherkin acceptance criteria AC-01…AC-36.
