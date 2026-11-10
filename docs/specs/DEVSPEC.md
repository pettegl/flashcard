# Flashcard — Development Specification (DEVSPEC)

**Status:** Draft · **Version:** 1.9.0 · **Last updated:** 2026-11-10
**Implements:** PRD v1.0.x (IDs `PR-xx`, `G-x`, `K-x`). **Presentation lives in the UISPEC; verification lives in the TESTSPEC.**

> Status values: `Draft` → `Approved` → `Implemented`. Per-milestone progress is tracked in §III.5.
> **Precedence:** behavior facts live here; the UISPEC references them. When code drifts from a spec, the spec wins unless the spec is deliberately updated first. **Exception:** for container behavior, the external *Curious Reader third-party game specification* (v1.11, `docs/reference/third-party-game-spec.md`, cited as **CR§n**) wins; this spec restates only what the game needs.

---

# Part I — Functional Requirements

## I.1 Overview

Flashcard is a single-page **TypeScript + React** web game, built into a *standalone* bundle that Curious Reader extracts to the device and opens from a `file://` URL inside a WebView. It has **no network access**. A child sees one card (image front / written-word back + audio) and moves through a deck.

### Packaging model (Layout B, 3-tier — see RD-2)

| Tier | ZIP file | Contains | One per |
|---|---|---|---|
| engine | `flashcard-core.zip` | `index.html`, JS, CSS, fonts, shared assets. **No** `lang/`, **no** `decks/`. | engine version |
| core (a **deck**) | `flashcard-book-<deck>.zip` | `decks/<deck>/deck.json`, `decks/<deck>/images/*` | deck |
| lang | `flashcard-book-<deck>-lang-<lang>.zip` | `lang/<lang>/<deck>.json`, `lang/<lang>/audios/<deck>_<card_id>.<ext>` | (deck, language) |

- Engine slug and `sub_app_id`: **`flashcard`** (pending OQ-1, OQ-2). URL template: `https://flashcard.example.org/?cr_book={book}&cr_lang={lang}` with `hasCoreLevel: true`. The container appends `cr_user_id`.
- `<deck>` = the `cr_book` value. Tokens `-core`, `-book-`, `-lang-` are frozen by the container (CR§5).
- All three ZIPs extract into one directory and must merge with **no overwritten file**. The deck-prefixed names (`<deck>.json`, `<deck>_<card_id>.<ext>`) exist precisely so two decks in one language never collide.

### Launch URL

`index.html?cr_lang=<lang>&cr_book=<deck>&cr_user_id=<id>` (CR§1). Dev default: `?cr_lang=english&cr_book=animals&cr_user_id=dev`.

## I.2 Data schema

### I.2.1 Deck file (core tier) — `decks/<deck>/deck.json`

```json
{
  "schema_version": 1,
  "deck_id": "animals",
  "card_order": ["alligator", "bear", "cat", "dog", "elephant"],
  "cards": [
    { "card_id": "alligator", "image": "images/alligator.png" },
    { "card_id": "bear",      "image": "images/bear.png" }
  ]
}
```

| Field | Rule |
|---|---|
| `schema_version` | integer, must equal `1` |
| `deck_id` | must equal the `cr_book` launch value |
| `cards[].card_id` | unique; regex `^[a-z0-9]+(-[a-z0-9]+)*$`; ≤ 64 chars (no underscore — `_` is the audio-filename delimiter) |
| `cards[].image` | relative path inside `decks/<deck>/`; no scheme, no leading `/`, no `..`, no `\`, `%`, `?`, `#`, tab/CR/LF or empty segment (RD-17); extension `png\|jpg\|jpeg\|webp\|svg`, any case |
| `card_order` | array of `card_id`; defines display order. Ids missing from `cards`, later duplicates and playable cards beyond `MAX_CARDS` are not schema violations: they are skipped or truncated at runtime (FR-09) and fail `verify:release` (FR-28) — RD-16 |

Brief mapping: `cards` ≙ the brief's "card definitions" (minus `target_word`, which is language-specific and moved to the lang tier — RD-8); `card_order` ≙ the brief's `card_order` array.

### I.2.2 Words file (lang tier) — `lang/<lang>/<deck>.json`

```json
{
  "schema_version": 1,
  "deck_id": "animals",
  "lang": "english",
  "cards": [
    { "card_id": "alligator", "target_word": "Alligator",
      "audio": "lang/english/audios/animals_alligator.mp3" }
  ]
}
```

| Field | Rule |
|---|---|
| `schema_version`, `deck_id`, `lang` | `1`; equals `cr_book`; equals `cr_lang` |
| `cards` | array |
| `cards[].card_id` | non-empty string; must match a deck card to be playable; a later duplicate of a valid entry is dropped |
| `cards[].target_word` | non-empty after trim; ≤ 64 characters (Unicode code points); displayed verbatim as **text** (never HTML, never trimmed), case preserved |
| `cards[].audio` | optional (absent or `null` = silent reveal); relative path starting `lang/<lang>/audios/`, with the same path rules as `cards[].image`; extension `mp3\|wav`, any case; **no URLs** (CR§2.1, CR§4) |

The first two rows are file-level: a violation makes the file unusable (E2). The `cards[]` rows are card-level: a violating entry is dropped with a warning and the rest of the file is used (FR-08, RD-17).

### I.2.3 Derived runtime type

```ts
interface PlayableCard { cardId: string; index: number; imageUrl: string; word: string; audioUrl: string | null }
```

`imageUrl = './decks/<deck>/' + image`; `audioUrl = './' + audio`.

### I.2.4 Persisted progress (localStorage)

Key `flashcard:v1:<lang>:<deck>` → `{"card_id":"bear"}`. Never stores user identifiers (NFR-06).

### I.2.5 Canonical system constants

| Name | Value | Used by |
|---|---|---|
| `LOAD_GATE_MS` | 5000 | FR-10 |
| `MAX_CARDS` | 100 | FR-09, FR-28 |
| `PRELOAD_CONCURRENCY` | 4 | FR-06 |
| `ENVELOPE_MAX_BYTES` | 65536 | FR-24 |
| `ZIP_MAX_BYTES` | 209715200 (200 MiB) | FR-27 |
| `SUB_APP_ID` | `flashcard` | FR-24 |
| `STORAGE_KEY_PREFIX` | `flashcard:v1` | FR-12 |

Presentation constants (timings, geometry, thresholds) are canonical in the UISPEC (§U.2).

## I.3 Modules and functional requirements

Build in the order below (the devspec order wins over any other ordering). Each module: **Goal → Tasks → Exit criterion**. FR rows carry the tier that introduces them.

### Module 0 — Scaffold & standalone build

**Goal:** a reproducible toolchain that emits a container-compliant bundle.
**Tasks:** project skeleton per §III.1; webpack config; TypeScript strict; ESLint; Jest; Playwright; scripts per §III.5.

| ID | Tier | Requirement | PRD |
|---|---|---|---|
| FR-01 | MVP | Standalone build: `output.publicPath: './'`; no `.map` files; CSS extracted to a file (no injected `<style>` tags); no inline `<script>`; no `eval`; browserslist per NFR-07; **no forbidden dependency** (see §II.3) in any `package.json` dependency field or in the runtime (non-`dev`) part of the lockfile; runtime `dependencies` are exactly `react` and `react-dom` (RD-15). | PR-12 |
| FR-02 | MVP | `npm run dev` serves the app with fixture content merged; `npm run build:merged` assembles `dist/merged/` = engine + fixture deck + fixture lang(s), a faithful simulation of container extraction. | PR-04, PR-12 |

**Exit:** `npm run build` succeeds; `dist/standalone/index.html` opens from `file://` and shows the loading screen without console errors; `npm run audit:standalone` passes.

### Module 1 — Platform: launch params and environment

| ID | Tier | Requirement | PRD |
|---|---|---|---|
| FR-03 | MVP | `parseLaunchParams(search)` returns `{ok: true, params: {lang, deck, userId}}` or `{ok: false, error: 'E1'}` (no params on error). `lang` and `deck` are required and must match `^[a-z0-9-]{1,64}$` after URL decoding, untrimmed; otherwise result is error **E1**. `userId` is optional opaque text (trimmed; `""` if absent or if the trimmed value is > 128 chars); never validated further, never invented. Params are never concatenated into a path before validation passes. | PR-04, PR-05 |
| FR-04 | MVP | `IS_FILE_ORIGIN = location.protocol === 'file:'`; `IN_CONTAINER = typeof window.ReactNativeWebView?.postMessage === 'function'`. Computed once at boot (module load of `env.ts`) through the pure `detectEnv(window)`, which tests call with a stub window. | PR-12 |

**Exit:** unit tests UT-01…UT-05 pass.

### Module 2 — Binary loader and preloader

| ID | Tier | Requirement | PRD |
|---|---|---|---|
| FR-05 | MVP | `loadBinary(url, {timeoutMs})` per CR§2.3: on `file:` use `XMLHttpRequest` (`arraybuffer`; success when status `0` or `200`); on http(s) use `fetch` + Cache Storage. **`caches` is never touched on `file:`.** Rejects on error/timeout. `loadJson(url, {timeoutMs})` = `loadBinary` + UTF-8 decode + `JSON.parse`. | PR-12, PR-16 |
| FR-06 | MVP | `preload(assets[], {concurrency: PRELOAD_CONCURRENCY, timeoutMs?})` takes typed entries `{kind: 'image'\|'audio'\|'font', url}` (fonts add `family`, `weight`) and resolves to a per-URL result map; it uses `Promise.allSettled`, and a failed asset (including one exceeding `timeoutMs`) is recorded with a `console.warn` and never rejects the batch. Images preload via `Image()` (relative `src`). Audio is loaded as bytes via `loadBinary` and not decoded (no `AudioContext` exists before the first gesture — FR-13). Fonts load via `FontFace` from `loadBinary` buffers; failure is non-fatal (system font stack). | PR-16 |

**Exit:** UT-06…UT-09 pass; with one deliberately missing asset, boot still reaches the ready screen (IT-03).

### Module 3 — Deck data

| ID | Tier | Requirement | PRD |
|---|---|---|---|
| FR-07 | MVP | `validateDeck(json, deck)` enforces §I.2.1 and returns the typed deck (known fields only). Any violation → throws one `DeckError` with `code: 'E2'` and `problems` listing every violation. | PR-04 |
| FR-08 | MVP | `validateWords(json, deck, lang)` enforces §I.2.2 and returns the typed words file holding only the valid cards. A file-level violation → throws `DeckError` (`E2`) listing every file-level problem. A card-level violation drops only that card, with one `console.warn('[flashcard] …')` naming all of its problems; for a duplicate `card_id` the first valid entry is kept. | PR-04, PR-05 |
| FR-09 | MVP | `buildPlayableCards(deck, words)`: iterate `card_order`; skip (with `console.warn('[flashcard] …')`) ids missing from `cards` or from `words`; drop later duplicates in `card_order`; result length ≤ `MAX_CARDS`, counted after skipping and de-duplication: the first `MAX_CARDS` playable cards are kept and the excess truncated with a warning (RD-16). Deck cards absent from `card_order` are not shown. Empty result → throws `DeckError` with `code: 'E3'`. A deck-level schema violation → **E2** (FR-07, FR-08). Per-card problems (missing word/audio/image) are never fatal. `DeckError.code` is the error screen code. | PR-04, PR-16 |

**Exit:** UT-10…UT-14 pass, covering every rule in the tables above.

### Module 4 — Boot and loading gate

| ID | Tier | Requirement | PRD |
|---|---|---|---|
| FR-10 | MVP | `boot(search)` resolves to the ready deck `{params, cards, index, preloaded}` or an error code. Sequence: (1) parse params → E1, before any request; (2) in parallel `loadJson` deck + words (each with timeout `LOAD_GATE_MS`) → any load, timeout or JSON failure E2; (3) `validateDeck` + `validateWords` + `buildPlayableCards` → the thrown `DeckError.code` (E2/E3); (4) restore progress with `restoreIndex(params, cards)` (FR-12), so the next step centres on the restored card (RD-18, RD-23); (5) preload *critical* assets = image and audio of the current card, then the fonts (`./fonts/NotoSans-{Regular,Bold}.woff2`, family `Noto Sans`, weights 400/700), then image and audio of current ±1, with `Promise.race` against `LOAD_GATE_MS`; (6) render ready UI; (7) once the critical batch settles, preload every other card nearest-first in the background. Every preload uses per-asset `timeoutMs: LOAD_GATE_MS`; results (including audio bytes for FR-13) are kept by URL in `preloaded`. Any other exception during boot shows **E9**. The loading screen **never** depends on network and always clears within `LOAD_GATE_MS` of step 2 finishing. | PR-12, PR-16 |

**Exit:** UT-32, CT-09, IT-01, IT-02, IT-04 pass; E2E-01 shows loading screen cleared in < 10 s offline.

### Module 5 — Deck state and persistence

| ID | Tier | Requirement | PRD |
|---|---|---|---|
| FR-11 | MVP | Pure reducer `{cards, index, face: 'front'\|'back'}`. Actions: `FLIP`, `NEXT`, `PREV`, `GO_TO(i)`. Rules: navigation actions that leave bounds `[0, n-1]` are no-ops (no wrap — pending OQ-5); **any change of `index` sets `face` to `'front'`** (RD-9); `GO_TO(current)` is a no-op, and so is `GO_TO` with a non-integer index (including `NaN`/`±Infinity`); a no-op returns the unchanged state object. `FLIP` — **MVP:** `front→back` only; **Better+:** toggles (FR-16). The reducer has no side effects. `DeckProvider`/`useDeck` (`src/state/DeckContext.tsx`) hold this state for the ready UI, seeded once from the boot result's `{cards, index}` on the front face (RD-19). | PR-02, PR-06, PR-07 |
| FR-12 | Quality | `src/storage/progress.ts`. **Save:** `saveProgress({lang, deck}, cardId)` writes `{"card_id": cardId}` to `localStorage[STORAGE_KEY_PREFIX:<lang>:<deck>]` in try/catch. The ready screen calls it from `DeckProvider`'s `onIndexChange(card)`, which fires after each committed change of `index` — never for the seed index, a flip or a no-op — so every navigation source (arrows, peeks, swipes, keys) saves without wiring of its own; the reducer stays pure. **Restore:** at boot (FR-10 step 4) `restoreIndex({lang, deck}, cards)` returns the index of the stored `card_id` if it exists in the playable list; otherwise `0`. Nothing stored → `0` silently; corrupt JSON (including a non-object value or a non-string `card_id`), an unknown id, or storage that throws or is unavailable → `0` with a `[flashcard]` warning, never an error. Face always starts `front` (RD-6, RD-23). | PR-14 |

**Exit (MVP, FR-11):** UT-15…UT-17, UT-19, UT-20 and CT-14 pass. **Exit (Better, FR-12 with FR-16):** UT-18, UT-21, UT-22, CT-14 (with `onIndexChange`) and IT-05's restore part pass; UT-19 is deleted (RD-19). IT-05's navigate-then-remount part needs the arrows and is in the Module 8 exit (RD-23).

### Module 6 — Audio

| ID | Tier | Requirement | PRD |
|---|---|---|---|
| FR-13 | MVP | `createAudioPlayer(cards, preloaded)` returns an `AudioPlayer` `{play(cardId), stop()}` that uses one shared Web Audio `AudioContext` (created lazily on the first `play`, which is called from a user gesture; `AudioContext`, else `webkitAudioContext`; `resume()` whenever its state is not `running`). `play(cardId)` stops any currently playing source, then starts the card's decoded buffer. `stop()` is called on any navigation and on flip to front; it also cancels a clip still being decoded, so a decode that settles after `stop()` or a newer `play()` never starts. A card with no audio, failed audio or bytes not preloaded yet plays nothing and raises no error; Web Audio missing or failing to construct gives silent reveals with one `[flashcard]` warning. Each card's bytes are read from `preloaded` (FR-06/FR-10, so bytes added later by the background batch are used) at its first `play`, decoded once with the callback form of `decodeAudioData` (iOS Safari 13) on a **copy** (decoding detaches its input) and cached; a decode failure yields a 1-frame silent `AudioBuffer`. No call ever throws into gameplay. Audio starts **at the moment the flip starts** (not after the animation). | PR-02, PR-16 |

**Exit:** UT-23 passes. E2E-03 (one `AudioBufferSourceNode.start` per reveal) needs the card and is verified in the Module 7 exits (RD-20).

### Module 7 — MVP card (see UISPEC §U.5)

| ID | Tier | Requirement | PRD |
|---|---|---|---|
| FR-14 | MVP | `CurrentCard` renders the current `PlayableCard` (from `useDeck`, FR-11) as a bordered card of `Wc × Hc` given by `cardSize(vw, vh)` in `computeLayout.ts` (UISPEC §U.7), recomputed on `resize`/`orientationchange` (`useViewport`): front = image (scaled to fit, UISPEC §U.5), back = `word` text only, rendered as a text node (never HTML, NFR-06) at the size chosen by `fitText` (UISPEC §U.5). A failed image load (`error` event) shows the placeholder (UISPEC §U.5) and the card stays operable; the card is keyed by `card_id`, so that state never carries over to another card. Until the flip animation (FR-21, Great) the flip is instant and only the active face is rendered (RD-21). **MVP shows the first card only** (navigation arrives in Better). | PR-01, PR-03, PR-05, PR-16 |
| FR-15 | MVP | Activating the card (click/tap, or `Enter`/`Space` with the default action prevented and key auto-repeat ignored) while `face='front'` dispatches `FLIP` and calls `AudioPlayer.play(card_id)` in the same handler, so the first `play` runs inside the user gesture (FR-13). The ready screen creates one `AudioPlayer` per deck with `createAudioPlayer(cards, preloaded)` and calls its `stop()` on unmount. At MVP, activating the back does nothing (FR-16 at Better; UISPEC §U.11). | PR-02 |
| FR-16 | Better | Activating the card while `face='back'` dispatches `FLIP` (→ front) and calls `AudioPlayer.stop`, in the same `CurrentCard` handler as FR-15 (which it supersedes for the back face); no audio plays. Unlimited repetition; audio plays on **every** `front→back`. | PR-07 |

**Exit (MVP):** AC-05…AC-10 pass, including E2E-03 (one audio start per reveal, FR-13); AC-06 is checked on the first card's landscape image only, and its other shapes by E2E-10 once more cards are reachable (RD-22). **Exit (Better, FR-16):** AC-11, AC-12 pass, including E2E-15 (5 audio starts in 10 alternating taps) (RD-20).

### Module 8 — Better navigation

| ID | Tier | Requirement | PRD |
|---|---|---|---|
| FR-17 | Better | `NavArrows` (UISPEC §U.6) dispatch `PREV`/`NEXT`; disabled at the ends. **Retired in Great:** component, styles, and tests are deleted when FR-18 ships. | PR-06 |

**Exit:** AC-13, AC-14 pass, and with them IT-05's navigate-then-remount part and E2E-06 (AC-36, FR-12 — RD-23); at Great, AC-17 passes (no arrows exist).

### Module 9 — Great carousel (UISPEC §U.7–U.9)

| ID | Tier | Requirement | PRD |
|---|---|---|---|
| FR-18 | Great | Carousel renders the current card fully and the previous/next card partially (front face only); no peek where no neighbour exists. Layout computed by pure `computeLayout(viewportW, viewportH)` (UISPEC §U.7). Recomputed on resize/orientation change; current card and face are preserved. | PR-08 |
| FR-19 | Great | Tapping a peek dispatches `GO_TO(index±1)` (no flip, audio stopped). | PR-09 |
| FR-20 | Great | Pointer-based gestures per UISPEC §U.8: a classified **swipe** dispatches `NEXT`/`PREV` (exactly one card per gesture); a classified **tap** is routed to flip or peek navigation. | PR-10 |
| FR-21 | Great | Flip is a `FLIP_MS` CSS 3D rotation (UISPEC §U.9); carousel movement is a `SLIDE_MS` slide. | PR-11 |
| FR-22 | Great | Input lock: inputs are ignored while a slide is running; taps on the current card are ignored while its flip is running; navigation during a flip resets the leaving card to front instantly. `prefers-reduced-motion: reduce` sets both durations to 0 (instant) and removes the lock. | PR-11, PR-15 |

**Exit:** AC-15…AC-32 pass; UT-24, UT-25 pass.

### Module 10 — Accessibility

| ID | Tier | Requirement | PRD |
|---|---|---|---|
| FR-23 | Quality | Keyboard: `Enter`/`Space` flip the focused current card; `ArrowLeft`/`ArrowRight` move to previous/next (keyboard is an addition beyond the brief — RD-12). Accessible names, hidden-face `aria-hidden`, visible focus, ≥ 44 px targets per UISPEC §U.10. | PR-15 |

**Exit:** AC-33…AC-35 pass; automated axe scan (E2E-12) has no serious/critical violations.

### Module 11 — Telemetry (`cr_event`, CR§6)

| ID | Tier | Requirement | PRD |
|---|---|---|---|
| FR-24 | Quality | `emit(collection, data, options?)` per CR§6.4: posts `JSON.stringify({type:'cr_event', payload})` through `window.ReactNativeWebView.postMessage` **only when `IN_CONTAINER`**; payload = `{payload_id: UUIDv4 fresh each time, cr_user_id, sub_app_id: SUB_APP_ID, payload_version: 1, collection, timestamp: ISO-8601 UTC, data, options?}`; `collection ∈ {user_sessions_data, summary_data}` (anything else dropped); `options` only on `summary_data`; synchronous, exception-safe, no await, no queue/retry/batch; message > `ENVELOPE_MAX_BYTES` is dropped (with a warning). `crypto.randomUUID` with the CR§6.4 pure-JS fallback. `data` is JSON-safe (no `undefined`/`NaN`/`Infinity`). | PR-13 |
| FR-25 | Quality | `SessionTracker` emits to `user_sessions_data` (every `data` includes `type`, `lang`, `deck`; durations in **milliseconds**): see table below. | PR-13 |
| FR-26 | Quality | After each `card_viewed` flush and at `session_started`/`deck_completed`, emit one `summary_data` document with `options` (below). | PR-13 |

**`user_sessions_data` events (granularity: per card visit, never per tap — RD-7):**

| `data.type` | When | Extra fields |
|---|---|---|
| `session_started` | once, when the ready screen first renders | `card_count`, `resumed` (bool: restored index > 0) |
| `card_viewed` | when a card stops being current (navigation) **or** the page becomes hidden / `pagehide`; the visit then continues as a new segment if the page returns | `card_id`, `card_index`, `flips` (front→back count in the segment), `audio_plays`, `duration_ms` (visible time only) |
| `deck_completed` | once per session, when every playable card has been revealed (front→back) at least once | `cards_total`, `cards_revealed`, `duration_ms` (since session start, visible time only) |

A flush with `duration_ms == 0` and no interaction is skipped. A segment is flushed at most once.

**`summary_data` documents:**

| Trigger | `data` | `options` |
|---|---|---|
| `session_started` | `{sessions: 1, last_deck: "<deck>", last_lang: "<lang>"}` | `{sessions:"add", last_deck:"replace", last_lang:"replace"}` |
| each `card_viewed` | `{cards_viewed: 1, cards_revealed: <0\|1>, total_time_ms: <duration_ms>, last_card_id: "<id>"}` | `{cards_viewed:"add", cards_revealed:"add", total_time_ms:"add", last_card_id:"replace"}` |
| `deck_completed` | `{decks_completed: 1}` | `{decks_completed:"add"}` |

**Exit:** UT-27…UT-31, E2E-07, E2E-08 pass; manual MAN-03/MAN-04 confirm container receipt.

### Module 12 — Packaging and release

| ID | Tier | Requirement | PRD |
|---|---|---|---|
| FR-27 | Release | `npm run package` builds `release/flashcard-core.zip`, `release/flashcard-book-<deck>.zip`, `release/flashcard-book-<deck>-lang-<lang>.zip` from `dist/standalone` and the production content directory (§III.1). ZIPs have no wrapping folder; each ≤ `ZIP_MAX_BYTES`. | PR-12 |
| FR-28 | Release | `npm run verify:release` checks: names/tokens; engine ZIP has root `index.html` and no `lang/`/`decks/`; core ZIP only `decks/<deck>/**`; lang ZIP only `lang/<lang>/**`; all ZIPs extract into one directory with no overwritten path; every referenced image/audio exists; every `card_order` id exists in the deck's `cards`, and `card_order` has ≤ `MAX_CARDS` distinct ids (RD-16); images and the tile icon are **true PNG/JPEG/WebP by magic bytes** matching their extension; no `.map`; no absolute `src="/`/`url(/`; no `http(s)://` in JSON data; no forbidden strings in the bundle (§II.3). | PR-12 |
| FR-29 | Release | Manual upload runbook (CR§8) is followed and recorded in the release notes: reserve slug → upload engine → reserve core + upload deck → upload each lang pack (+ true-PNG icon ≥ 512×512 preferred) → `list_inventory` → promote → ask Curious Learning staff to Publish. | PR-12 |

**Exit:** `verify:release` passes; MAN-01…MAN-06 signed off.

---

# Part II — Non-Functional Requirements

## II.1 Design principles

1. Content is data; the player has no per-deck code.
2. Offline first: nothing at runtime may need a network.
3. A child is never stuck: every failure degrades (silent audio, placeholder image, skipped card) rather than blocks. Only unusable deck data shows an error screen.
4. Pure logic (reducer, layout, gestures, validation, telemetry shaping) is separate from React and unit-tested.
5. Reporting is fire-and-forget and can never throw into gameplay.

## II.2 Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 | **Offline:** zero requests to non-`file:`/`data:`/`blob:` schemes during load and play; zero `NETGUARD_BLOCK` log entries (CR§1). |
| NFR-02 | **Load:** loading screen clears < 10 s on the reference device with network off (gate at `LOAD_GATE_MS`). |
| NFR-03 | **Responsiveness:** tap → flip start ≤ 100 ms; animations target 60 fps on the reference device. Reference device: mid/low-end Android phone, Android 8+ WebView (exact model recorded in the release notes). |
| NFR-04 | **Asset budgets:** image ≤ 300 KB and ≤ 1600 px on the long side; audio ≤ 200 KB and ≤ 5 s — guidance, enforced by `verify:release` warnings. Deck ≤ `MAX_CARDS` and each ZIP ≤ `ZIP_MAX_BYTES` are hard limits: `verify:release` fails (FR-28, RD-16). |
| NFR-05 | **Reliability:** any single missing/corrupt image, audio, font, or card never produces an uncaught exception or blank screen. |
| NFR-06 | **Security/privacy:** no PII; `cr_user_id` is used only as an opaque envelope field; launch params validated by regex before use; deck text rendered as text (no `dangerouslySetInnerHTML`); no `eval`/`new Function`; no third-party runtime code. |
| NFR-07 | **Compatibility:** browserslist `chrome >= 80, ios_saf >= 13` (pending OQ-3). Avoid APIs newer than that without fallback (notably `crypto.randomUUID` → FR-24 fallback; CSS `aspect-ratio` → not used, sizes computed in JS). |
| NFR-08 | **Quality gates:** TypeScript `strict`; ESLint clean; unit/component coverage ≥ 90% lines for non-UI modules, ≥ 80% overall. |
| NFR-09 | **Accessibility:** FR-23 and UISPEC §U.10; WCAG 2.1 AA contrast for word text. |
| NFR-10 | **Diagnostics:** `console.warn('[flashcard] …')` for recoverable issues; no `console.error` on any happy path. |
| NFR-11 | **Localization:** all learner-visible text comes from content files. The only app-owned strings are English accessibility labels and error codes, kept in a single `strings.ts` table for future localization (UISPEC §U.4, §U.10). |

## II.3 Forbidden in the standalone build (CR§3)

Service Workers/Workbox registration; `caches` on `file:`; `fetch` for local assets on `file:`; feature-flag SDKs (Statsig…); Google Tag Manager; Sentry/crash reporters; Firebase/GA/Mixpanel; WebSockets/EventSource; Facebook Pixel; `uuid` packages; CDN script/font/WASM URLs. `audit:standalone` fails the build on dependency names or bundle strings matching these (`statsig`, `googletagmanager`, `gtag`, `sentry`, `workbox`, `serviceWorker.register`, `firebase`, `mixpanel`, `fbevents`, `cdn.jsdelivr`). `caches.open` is allowed only inside the http branch of `loadBinary.ts`; because minified bundles lose file names, the audit checks this rule on `src/`. The same rules are also enforced at lint time (`no-restricted-globals` for `fetch`/`caches`/`WebSocket`/`EventSource`, `no-eval`, `no-new-func`, no `dangerouslySetInnerHTML`, no `navigator.serviceWorker`).

## II.4 Error handling

| Condition | Behavior |
|---|---|
| Missing/invalid `cr_lang`/`cr_book` | Error screen **E1**; no network/file requests issued |
| Deck/words file missing, unreadable, invalid JSON, schema violation, load timeout | Error screen **E2** |
| Zero playable cards after merge | Error screen **E3** |
| A card id in `card_order` missing from `cards` or words | Card skipped + warning |
| A words entry breaks a card-level rule (§I.2.2) | Entry dropped + warning (card then skipped as missing a word) |
| Image fails to load | Placeholder face; card still flips |
| Audio missing/undecodable | Silent reveal |
| Font fails | System font stack |
| `localStorage` unavailable/corrupt | Start at card 0 |
| `AudioContext` unavailable | Silent reveal |
| `postMessage` throws / outside container | Swallowed; no-op |
| Envelope > 64 KB | Dropped with warning |
| Unhandled React error, or an unexpected (non-`DeckError`) exception during boot | Error boundary (or boot) shows the error screen with code **E9**; telemetry untouched |

## II.5 Risks and mitigations

| Risk | Mitigation |
|---|---|
| Older WebViews lack an API | Build target + fallbacks (NFR-07); manual device tests MAN-01/02/06 |
| `fetch`/Cache API fail on `file://` | `loadBinary` XHR path; unit + e2e from `file://` |
| Missing assets stall loading | `allSettled`, gate race, per-asset isolation |
| Container CSP blocks inline styles | No inline `<style>`/`style=""` in static HTML; dynamic styling via CSSOM (`element.style`) only (OQ-4) |
| Spec drift across sections | Cross-section audit + pre-scaffold pass (§III.6) |
| Packaging collisions | Deck-prefixed filenames + merge test PKG-05 |
| Audio autoplay restrictions | Audio only starts from a user gesture |
| High-frequency telemetry | Per-card-visit granularity (RD-7) |

---

# Part III — Implementation Guide

## III.1 Directory structure and artifact lifecycle

**Functional tree (by purpose):**

```
flashcard/
  docs/              specs + external contracts
  src/               game source (platform, data, audio, state, storage, telemetry, ui)
  scripts/           build/fixture/package/verify tooling
  fixtures/          generated test content (valid + broken)
  tests/             unit/component/integration (under tests/, *.test.ts[x]) and e2e (*.spec.ts)
  content/           production decks, languages, icons (real assets; not in git)
  dist/              build output
  release/           upload-ready ZIPs
```

**Implementation layout (what is scaffolded):**

```
.github/copilot-instructions.md      spec-driven workflow rules
docs/specs/{PRD,DEVSPEC,UISPEC,TESTSPEC}.md
docs/reference/third-party-game-spec.md   external container contract (CR§)
docs/"Flashcard Spec Brief.md"       original brief (local only: gitignored, not published)
README.md  LICENSE                    project overview, getting started; MIT
package.json  tsconfig.json  eslint.config.mjs  babel.config.cjs  jest.config.cjs  playwright.config.ts
webpack.config.cjs                   STANDALONE build; publicPath './'; CSS extract; copies fonts
src/index.tsx  src/index.html        entry; static HTML (no inline script/style)
src/app/{App.tsx,boot.ts,ErrorBoundary.tsx}
src/platform/{launchParams.ts,env.ts,loadBinary.ts,preload.ts}
src/data/{types.ts,validateDeck.ts,validateWords.ts,buildPlayableCards.ts}
src/state/{deckReducer.ts,DeckContext.tsx}
src/storage/progress.ts
src/audio/audioPlayer.ts
src/telemetry/{crEvent.ts,uuid.ts,sessionTracker.ts}
src/ui/{Card.tsx,Carousel.tsx,NavArrows.tsx(Better only; deleted at Great),LoadingScreen.tsx,ErrorScreen.tsx}
src/ui/{computeLayout.ts,gestures.ts,fitText.ts,useViewport.ts,strings.ts,tokens.css,app.css}
src/assets/fonts/NotoSans-{Regular,Bold}.woff2     (bundled; Latin + Latin Extended subset; static instances — RD-14)
src/assets/fonts/OFL.txt                           (SIL Open Font License; ships next to the fonts)
scripts/{make-fixtures.mjs,build-merged.mjs,audit-standalone.mjs,package.mjs,verify-release.mjs}
tests/unit/**  tests/component/**  tests/integration/**  tests/e2e/**
tests/globalSetup.cjs                Jest globalSetup: generates fixtures once if absent, before workers start
fixtures/content/{decks/animals/**,lang/english/**,lang/spanish/**}   generated
fixtures/variants/<name>/**                                           generated (failure/edge variants, TESTSPEC §3.2)
content/{decks/<deck>/**,lang/<lang>/**,icons/<deck>-<lang>.png}     production content
```

**Engine output** (`dist/standalone/` = the content of `flashcard-core.zip`): `index.html`, `js/main.<hash>.js` (+ `main.<hash>.js.LICENSE.txt`), `css/main.<hash>.css`, `fonts/NotoSans-{Regular,Bold}.woff2`, `fonts/OFL.txt`. Runtime font URLs are `./fonts/NotoSans-<Weight>.woff2` (FR-06).

| Path | Class | Rule |
|---|---|---|
| `src/`, `scripts/`, `tests/`, `docs/`, configs, `README.md`, `LICENSE`, `src/assets/fonts` | **Versioned** | committed to the public repository `github.com/pettegl/flashcard` (MIT) |
| `docs/Flashcard Spec Brief.md` | **Local** | original brief; gitignored, never published |
| `node_modules/`, `dist/`, `release/`, `coverage/`, `test-results/`, `playwright-report/` | **Ephemeral** | regenerated < 1 min–10 min; gitignored |
| `fixtures/**` | **Ephemeral** | regenerated deterministically by `npm run fixtures`; gitignored |
| `content/**` (real images, recorded audio, icons) | **Durable** | cannot be regenerated; gitignored from this repo, backed up separately by the content team |
| Uploaded ZIPs in the CMS, release notes | **Durable** | owned by Curious Learning / release record |

**Two-tree sync rule:** any file added to one tree is added to the other in the same change.

## III.2 Environment and configuration

- Runtime: **no** env vars, no config files fetched. Constants in §I.2.5 and UISPEC §U.2 are compiled in.
- Build: `NODE_ENV=production`, `STANDALONE=true` (default for `npm run build`; reserved for a future non-container build). `SUB_APP_ID` is a source constant.
- Node ≥ 20 LTS, npm ≥ 10. Pinned via `package-lock.json`.

## III.3 Technology stack

| Choice | Rationale |
|---|---|
| TypeScript 5 (strict) | Typed schema/contract code; spec-to-type traceability |
| React 18 | Component model, mature testing; small enough for low-end devices |
| webpack 5 + babel-loader (Babel 7) | CR's reference config (publicPath, CopyWebpackPlugin patterns); browserslist targeting. Babel stays on 7 because `babel-jest` 29 requires `@babel/core` 7 |
| mini-css-extract-plugin | No injected `<style>` (CSP-safe) |
| CSS 3D transforms + CSSOM styles | Flip/slide need no animation runtime (no Rive/dotLottie — RD-4) |
| Web Audio API (decode via `loadBinary`) | Works on `file://`; one-voice control (RD-5) |
| Pointer Events | One code path for touch and mouse |
| ESLint 10 (flat config `eslint.config.mjs`) + `typescript-eslint` + `eslint-plugin-react-hooks` | Supported ESLint line (RD-13); also enforces the §II.3 / NFR-06 code rules at lint time |
| Jest 29 + babel-jest + jsdom + React Testing Library | Unit/component/integration; Jest `roots` include `src/` so untested files count toward coverage (NFR-08) |
| Playwright (full Chromium, new headless mode: `channel: 'chromium'`) | `file://` + offline + viewport + emulated touch e2e. Launched with `--allow-file-access-from-files` so `file://` XHR works as in the container WebView (CR§1). `PW_CHANNEL=chrome` runs the installed Google Chrome where a machine policy blocks Playwright's own binaries |
| `@axe-core/playwright` | Automated accessibility scan |
| `archiver`, `yauzl` (or `unzipper`) | Cross-platform ZIP create/inspect; magic-byte checks done in Node (no `file` dependency on Windows) |

No runtime dependencies other than `react` and `react-dom`.

## III.4 Runbook from a clean machine

```
install Node 20 LTS
git clone <repo> && cd flashcard
npm ci
npm run fixtures            # generate fixture content (valid + broken)
npm run typecheck && npm run lint
npm test                    # unit + component + integration
npm run build               # dist/standalone (engine only)
npm run audit:standalone    # forbidden-dependency/bundle audit
npm run build:merged        # dist/merged = engine + fixtures
npx playwright install chromium
npm run test:e2e            # file:// offline e2e against dist/merged
npm run dev                 # http://localhost:8080/?cr_lang=english&cr_book=animals&cr_user_id=dev
npm run package             # release/*.zip from dist/standalone + content/
npm run verify:release
```

## III.5 Deliverables per milestone and status

| MS | Name | Modules | Deliverable | Spec exit | Implementation status |
|---|---|---|---|---|---|
| MS1 | MVP | 0–4, 5 (FR-11), 6, 7 (FR-01…FR-11, FR-13…FR-15) | First card tap-to-reveal with audio from fixtures | AC-01…AC-10 | Approved 2026-11-10 (Modules 0–2 Done (tested) and Approved 2026-11-06; Modules 3, 4, Module 5 (FR-11), 6 and 7 Done (tested) and Approved 2026-11-10; TESTSPEC MS1 gate green; AC-06 beyond the landscape first card deferred to E2E-10, RD-22) |
| MS2 | Better | 5 (FR-12), FR-16, 8 (FR-17) | Arrows, repeatable flip, resume | AC-11…AC-14, AC-36 | In progress (Module 5 Better (FR-12 with FR-16) and the Module 7 Better exit (AC-11, AC-12, E2E-15) Done (tested) and Approved 2026-11-10; Module 8 (FR-17) with IT-05's navigation part and E2E-06, and PERF-02 Not started) |
| MS3 | Great | 9–10 (FR-18…FR-23) | Carousel, gestures, animation, a11y; arrows removed | AC-15…AC-35 | Not started |
| MS4 | Container-ready | 11 (FR-24…FR-26) | `cr_event` telemetry | UT-27…UT-31, E2E-07, E2E-08 | Not started |
| MS5 | Release | 12 | ZIPs verified, uploaded, promoted, published | MAN-01…06 | Not started |

Status vocabulary: `Not started` · `In progress` · `Done (tested)` · `Approved`. Updated only by a spec-update task (§III.7).

`package.json` scripts (normative names): `dev`, `build`, `build:merged`, `fixtures`, `typecheck`, `lint`, `test`, `test:e2e`, `audit:standalone`, `package`, `verify:release`.

**Dry-run table** (every script must exist and pass on fixtures before a milestone closes):

| Script | Proves |
|---|---|
| `fixtures` | deterministic valid + broken content generated, true PNGs |
| `build` + `audit:standalone` | FR-01, §II.3 |
| `build:merged` | FR-02 merge-clean simulation |
| `test`, `test:e2e` | FR-03…FR-26 |
| `package` + `verify:release` | FR-27, FR-28 |

**Project metrics table (fill at MS5):** time to ship · test count · % AI-generated code · production bugs in first 30 days · % bugs caught pre-deploy.

## III.6 Spec hygiene (SDAD disciplines)

- **Cross-section consistency audit** before each spec-update task closes: grep every constant used in more than two places (`FLIP_MS`, `SLIDE_MS`, `LOAD_GATE_MS`, `MAX_CARDS`, `ENVELOPE_MAX_BYTES`, `MIN_SLIVER_PX`, ID ranges `FR-`, `AC-`, test IDs) and confirm one canonical definition with all other mentions referring to it.
- **Pre-scaffold pass (run twice before writing code):** every directory in the functional tree appears in the implementation layout; every dry-run script exists in the layout and `package.json`; every test file named in the TESTSPEC maps to the layout; webpack config includes all entry/copy paths; `.gitignore` covers every non-versioned path in §III.1.
- **Dependency validation:** `npm run fixtures` and `npm run build` verify tool availability up front; long Playwright runs write results incrementally (`test-results/`).

## III.7 Spec-driven workflow (how every task runs)

1. **Plan.** Every new task plan begins with a **Spec References** block listing the PRD (`PR-`), DEVSPEC (`FR-`/`NFR-`), UISPEC (`U-`/`AC-`), and TESTSPEC (test IDs) it touches, plus an **expected spec impact** line (none / which docs). Work that has no spec home is first added to the specs (Draft), then built.
2. **Build and test.** Implement in devspec order; the TESTSPEC defines what to test. Failures that expose a spec defect update the specs in the order **DEVSPEC → UISPEC → TESTSPEC** (PRD only if goals change).
3. **Complete.** A task is complete only when its tests pass and the human owner has reviewed (security, architecture, behavior) and approved.
4. **Spec-update task.** On completion + approval, the agent **prompts the owner** to start a new task, *"Update specs for <task>"*. That task must, for every spec it alters: (a) update **Status**, (b) set **Last updated** to the date, (c) bump **Version** (patch = typos/clarifications; minor = new/changed requirements; a major bump = new file), (d) add a line at the top of the **Spec change log** at the bottom of that spec in exactly this format: `2026-MM-DD — <author> — <one-sentence description of change>`; (e) update DEVSPEC §III.5 milestone status, resolve or add Open Questions (resolved → Appendix B with date and rationale), and process the Lessons Log; (f) run the cross-section consistency audit.
5. **Report.** On completing the spec-update task the agent returns a **list of all changes**, per spec: *Added*, *Changed*, *Removed* (with removed text/IDs named), plus the new Status/Version/Last-updated values.
6. **Rules:** specs are committed after every checkpoint; the testspec is reviewed by someone other than the devspec author (a separate review pass if the author is an AI) to add cases the author missed; the PRD never references other spec filenames.

---

# Part IV — Appendices

## Appendix A — Open Questions

| ID | Question | Blocks | Default assumption |
|---|---|---|---|
| OQ-1 | Is engine slug `flashcard` free? (reservation is permanent — CR§8.2) | FR-29 | `flashcard` |
| OQ-2 | Is `sub_app_id` `flashcard` agreed with the data team? | FR-24 release, FR-29 | `flashcard` |
| OQ-3 | Minimum Android WebView / iOS versions to support? | FR-01 final browserslist | Chrome ≥ 80, iOS ≥ 13 |
| OQ-4 | Exact CSP the container injects (inline style attributes, `blob:`, `data:`)? | MAN-01 sign-off | Assume strict; use CSSOM only |
| OQ-5 | Should the deck loop (wrap-around) at the ends? | FR-11, FR-18 | No wrap |
| OQ-6 | Baselines/targets for K-5, K-6 | PRD K-5/K-6 (not dev) | Set after 30 days of data |
| OQ-7 | Right-to-left languages in v1? | none | Out of scope (NG-6) |
| OQ-8 | Is a "replay audio" control needed? | none | No (NG-6) |
| OQ-9 | May the core ZIP use `decks/` and the lang ZIP deck-prefixed names inside `lang/<lang>/`? | FR-27 | Yes, per CR§5.2 disjoint-subtree rule |
| OQ-10 | Who produces tile icons (per deck × language)? | FR-29 | Content team, true PNG ≥ 512×512 |
| OQ-11 | Which scripts must render at launch (beyond Latin)? | none | Latin + Latin Extended (bundled Noto Sans); others fall back to system font |
| OQ-13 | When the child reaches a card whose audio bytes the background batch has not loaded yet, should `play` load them on demand (late audio) instead of revealing silently? And should decoded buffers be capped for a 100-card session on low-end devices (MAN-06)? | FR-13 at Better (navigation); not MVP, whose only card is in the critical batch | Silent reveal; decoded buffers cached for the session |

## Appendix B — Resolved Decisions

| ID | Date | Decision | Rationale |
|---|---|---|---|
| RD-1 | 2026-11-05 | Build as a **web** game (React + TypeScript), not React Native. | The container runs games as web content in a WebView; the brief's React Native mention was workshop context. |
| RD-2 | 2026-11-05 | **Layout B**: engine + core (deck) + lang. | Images/order are language-independent and words/audio are per language — exactly the 3-tier use case; avoids duplicating images per language. Fallback: Layout A with images in each lang ZIP. |
| RD-3 | 2026-11-05 | Release target is the **Great** tier; arrows are retired when the carousel ships. | The brief says the carousel drops the arrows. |
| RD-4 | 2026-11-05 | Flip/slide use CSS transforms; no Rive/dotLottie. | No offline WASM/runtime risk (CR§3). |
| RD-5 | 2026-11-05 | Audio via Web Audio decoded from `loadBinary` buffers. | Matches CR§2.3 pattern; single-voice control; silent-buffer fallback. |
| RD-6 | 2026-11-05 | Persist last `card_id`; always resume on the front face. | Robust to deck reordering; avoids surprising audio/state. |
| RD-7 | 2026-11-05 | Telemetry granularity is per card visit, not per tap. | CR§6.5 forbids unbounded high-frequency events. |
| RD-8 | 2026-11-05 | `target_word` and audio path live in the lang tier; image and order in the core tier. | Keeps language-specific data out of shared tiers. |
| RD-9 | 2026-11-05 | Changing the current card always resets the face to front. | Predictable learning loop; simple state. |
| RD-10 | 2026-11-05 | A swipe moves exactly one card. | Matches "spin the carousel" by one position; simple and testable. |
| RD-11 | 2026-11-05 | MVP milestone shows only the first card; navigation arrives in Better. | Literal reading of the brief's tiering. |
| RD-12 | 2026-11-05 | Keyboard control and a11y labels are included as a small addition beyond the brief. | Enables accessibility and keyboard-driven automated tests; negligible cost. |
| RD-13 | 2026-11-06 | Lint with ESLint 10 and flat config (`eslint.config.mjs`) instead of `.eslintrc.cjs`; `eslint-plugin-react` is not used (no ESLint 10 support), `eslint-plugin-react-hooks` is. | Owner decision. ESLint 8, the last line supporting `.eslintrc`, has been end-of-life since 2024-10, and ESLint 10 removed eslintrc. |
| RD-14 | 2026-11-06 | Bundled fonts are Noto Sans from `google/fonts` (`ofl/notosans`, variable `[wdth,wght]`), instanced to static wght 400/700, wdth 100, and subset to Latin + Latin Extended (U+0020–007E, U+00A0–036F, U+1E00–1EFF, U+2000–206F, U+20A0–20CF, U+2100–214F, U+2C60–2C7F, U+A720–A7FF, U+FEFF, U+FFFD) as WOFF2 with HarfBuzz (`subset-font`); `OFL.txt` ships beside them. | Satisfies OQ-11 at ≈ 77–81 KB per weight; static instances keep `FontFace` simple; OFL requires the licence to accompany redistribution. |
| RD-15 | 2026-11-06 | The FR-01 lockfile check covers only runtime (non-`dev`) lockfile entries; `package.json` is checked in every dependency field. | Dev tooling never ships in the bundle, and tools such as `webpack-dev-server` may legitimately pull utility packages; what ships is guarded by the runtime tree, `dependencies` = `react`/`react-dom`, and the bundle-string audit. |
| RD-16 | 2026-11-10 | Resolves OQ-12. A `card_order` with more than `MAX_CARDS` playable cards, or with ids missing from `cards`, is not a deck-level violation: at runtime the unknown ids are skipped and the first `MAX_CARDS` playable cards (counted after skipping and de-duplication) are kept, each with a warning (FR-09); `verify:release` fails on both (FR-28, NFR-04). §I.2.1 and UT-11 no longer list them. | Owner decision. Design principle II.1.3: an otherwise usable deck must not block a child; `MAX_CARDS` bounds memory and preloading, which truncation achieves. A runtime warning is invisible on a child's device, so the content team is stopped at release time instead. |
| RD-17 | 2026-11-10 | Content paths (deck `image`, words `audio`) also reject `\`, `%`, `?`, `#`, tab/CR/LF and empty segments, and match extensions in any case. A words entry that breaks a card-level rule is dropped with a warning instead of failing the file; `DeckError` carries the screen code (`E2`/`E3`) and the full problem list. | Owner approval of Module 3. The URL parser maps `\` to `/`, decodes `%2e%2e` to `..` and strips tab/LF, so "no `..`" alone does not keep a path inside its folder; `.PNG` is a harmless content-team habit. Dropping one entry follows design principle II.1.3, and a code on the error lets boot (FR-10) pick the screen without re-classifying. |
| RD-18 | 2026-11-10 | Boot (FR-10) starts on card 0 until FR-12 ships at Better; the critical batch puts the current card before the fonts and the neighbours; the background batch starts only after the critical batch settles and loads nearest-first; every preload has a per-asset `LOAD_GATE_MS` timeout; a non-`DeckError` exception during boot is E9. Until the MVP card (Module 7) ships, the ready UI is a stand-in showing the current card's front with the `card-current`/`face-front` hooks. | Owner approval of Module 4. FR-10 step (4) cited FR-12 inside MS1, which excludes FR-12 and shows only the first card (RD-11). With `PRELOAD_CONCURRENCY` 4 the current card's image and audio load first; starting the background batch after the critical one keeps ≤ 4 requests in flight, and the per-asset timeout frees the slot of a hung file so the rest still load. Classifying unknown exceptions as E9 keeps E2 meaning "bad data". |
| RD-19 | 2026-11-10 | Module 5 is split by tier: FR-11 ships in MS1 with the MVP one-way `FLIP` (UT-19); FR-12 and the toggling `FLIP` (UT-18, FR-16) ship together at Better, when UT-19 is deleted. The deck state lives in `DeckProvider`/`useDeck`, seeded once from the boot result; a no-op action returns the unchanged state object, so React skips the re-render. | Owner decision at Module 5. The Module 5 exit listed UT-15…UT-22, which mixes tiers and requires the contradictory UT-18 and UT-19; MS1 lists FR-11 but excluded Module 5, and MS2 owns FR-12 (RD-11, RD-18). |
| RD-20 | 2026-11-10 | The Module 6 exit is UT-23 only; E2E-03 moves to the Module 7 MVP exit as a single tap → one audio start, and its 10-alternating-taps half becomes E2E-15 in the Module 7 Better exit (FR-16). The `AudioPlayer` is built by `createAudioPlayer(cards, preloaded)` and reads bytes at play time (FR-13). | Owner approval of Module 6. E2E-03 taps the card, which arrives with FR-15 (Module 7), and back-to-front taps need FR-16 (Better), so no Module 6 build could pass it. Reading the shared `preloaded` map at play time picks up the background batch without extra wiring. |
| RD-21 | 2026-11-10 | The MVP card renders only the active face and flips instantly, inside the `.card` > `.card-inner` > face structure that FR-21 (Great) animates; the back face is inert at MVP but keeps its UISPEC §U.10 name ("… Activate to flip back."). The card size comes from `cardSize` in `computeLayout.ts`, which the Great carousel layout (FR-18, UT-24) extends; the word size comes from `fitText`, measured with canvas text metrics in the Bold word font. | Owner approval of Module 7. Animation and the input lock are Great (FR-21, FR-22); rendering one face meets the hidden-face rule (§U.10) without `aria-hidden` bookkeeping, and IT-01 already expects no `face-back` on the front. MS1 is never released on its own (MS5 builds on MS4) and FR-16 makes the back name true at Better. One `cardSize` keeps the MVP and Great card the same size. |
| RD-22 | 2026-11-10 | The `missing-image`, `missing-audio` and `long-word` variants target `alligator`, the first card; E2E-14 reveals the current Spanish card instead of all five; E2E-02's pass covers every reachable card (card 0 at MVP); AC-06 is checked at MVP on the landscape first card (CT-01, E2E-03) and for all four shapes by E2E-10. | Owner decision at Module 7. The MVP shows only card 0 (RD-11), so variants on `cat`/`bear` and "reveal all" could not run in MS1 — the RD-20 rule that an exit may only name tests its tier can pass applies to fixtures and steps too. |
| RD-23 | 2026-11-10 | Progress (FR-12) is saved from one place, `DeckProvider`'s `onIndexChange`, an effect that fires after each committed index change (not for the seed, flips or no-ops), instead of from every navigation handler; `restoreIndex` warns on corrupt data, unknown ids and unavailable storage but is silent when nothing is stored. IT-05 is split: its restore part (stored `dog` → boot on `dog` front, remount, unknown/corrupt → card 0) is in the Module 5 Better exit, and its navigate-then-remount part joins E2E-06 in the Module 8 exit. | Owner approval of Module 5 (Better). One effect covers the arrows, peeks, swipes and keys that arrive later without each having to remember to save, and keeps side effects out of the reducer. Until FR-17 nothing in the UI changes the index, so "navigate to card 4" cannot run in Module 5 — the RD-20 rule again. Warnings make a lost resume diagnosable; a first launch is not a problem. |
## Appendix C — Out of Scope

NG-1…NG-7 from the PRD; additionally: authoring tools, CMS changes, container changes, per-language font packs, analytics dashboards.

## Appendix D — Lessons Log

*(Raw, unpolished record of wrong assumptions found during implementation. At each major version transition classify every entry — integrated / needs strengthening / moved to troubleshooting — then remove it.)*

| Date | Lesson | Classification |
|---|---|---|
| 2026-11-06 | `@babel/core` latest is 8, but `babel-jest` 29 peers on `@babel/core` 7; an unpinned install fails with ERESOLVE. | Integrated (§III.3 Babel 7 note) |
| 2026-11-06 | Jest `roots: ['tests']` hides untested `src/` files from coverage, inflating NFR-08 numbers; brace-glob `coverageThreshold` keys did not match on Windows, and a threshold key with no files fails the run. Fix: `roots` include `src/`; per-directory threshold keys added only for existing non-UI module folders. | Integrated (§III.3 Jest row; `jest.config.cjs`) |
| 2026-11-06 | On the Windows dev machine a policy denies Node from spawning executables under `%LOCALAPPDATA%\ms-playwright` (`spawn EPERM`), so Playwright's bundled browsers cannot start; installed Chrome works. | Integrated (§III.3 Playwright row, `PW_CHANNEL`); needs strengthening: confirm the CI runner uses Playwright's Chromium |
| 2026-11-06 | `.eslintrc.cjs` named in the layout only works with end-of-life ESLint 8. | Integrated (RD-13, §III.1) |
| 2026-11-06 | Re-evaluating boot-time constants (FR-04) in a test with `jest.isolateModules` + `require()` fails lint (`@typescript-eslint/no-require-imports`); use `jest.isolateModulesAsync` with a dynamic `import()`. | Integrated (`tests/unit/env.test.ts`; TESTSPEC UT-05) |
| 2026-11-06 | FR-06 decoded audio during preload, but FR-13 creates the only `AudioContext` on the first gesture, so boot preload had no context to decode with. Preload now returns bytes; decoding and the silent-buffer fallback moved to the audio player (owner decision). | Integrated (FR-06, FR-13; TESTSPEC UT-09, UT-23) |
| 2026-11-06 | The Jest jsdom environment has no `TextEncoder`/`TextDecoder`, `fetch`, `caches`, `FontFace` or `document.fonts`; tests stub them (`node:util` for the codecs). With fake timers, attach `expect(p).rejects` before advancing time, or the timeout rejection is reported as unhandled. | Integrated (`tests/unit/loadBinary.test.ts`, `tests/unit/preload.test.ts`) |
| 2026-11-10 | Two `card_order` rules contradicted each other across sections: §I.2.1/UT-11 made an oversized order and an unknown order id fatal (`DeckError` → E2), while FR-09/UT-13/UT-14 and the `dup-order`/`bigdeck-120` fixtures skip or truncate them. | Integrated (RD-16; §I.2.1, FR-09, FR-28, NFR-04; TESTSPEC UT-11, UT-14, PKG-12, PKG-13) |
| 2026-11-10 | FR-08 said `validateWords` throws on any violation "likewise", but UT-12 drops a card for a card-level issue and only throws for file-level ones. | Integrated (FR-08, §I.2.2 file-/card-level note, RD-17) |
| 2026-11-10 | "No scheme, no leading `/`, no `..`" does not keep a path in its folder: the URL parser turns `\` into `/`, `%2e%2e` into `..` and strips tab/LF. | Integrated (§I.2.1, §I.2.2, RD-17; TESTSPEC UT-11, UT-12) |
| 2026-11-10 | Each fixture-reading test file regenerating `fixtures/` in `beforeAll` races across parallel Jest workers on a clean checkout (`make-fixtures` deletes the tree first). | Integrated (§III.1 `tests/globalSetup.cjs`; TESTSPEC §6) |
| 2026-11-10 | Desktop Chromium blocks XHR from one `file://` URL to another ("Cross origin requests are only supported for…"), so boot showed E2 in Playwright although the container WebView applies no same-origin policy to local files (CR§1). | Integrated (§III.3 Playwright row, `playwright.config.ts` `--allow-file-access-from-files`; TESTSPEC §2) |
| 2026-11-10 | Offline from `file://` the loading screen clears within a frame, so a polling `toBeVisible()` on `loading` races and BLD-02 became flaky once boot existed. Record the first appearance in-page with a `MutationObserver` init script instead. | Integrated (`tests/e2e/helpers.ts`; TESTSPEC §3.3, BLD-02, E2E-01) |
| 2026-11-10 | jsdom never fires `load` on `Image` (no resource loading), so boot tests need a fake `Image`; a per-file `@jest-environment-options {"url": "file:///…"}` makes `IS_FILE_ORIGIN` true so `loadBinary` takes the XHR path; `ArrayBuffer`s read through `node:fs` fail `expect.any(ArrayBuffer)` (another realm), so assert on `byteLength`. | Integrated (`tests/integration/boot.test.tsx`) |
| 2026-11-10 | FR-10 step (4) "restore progress (FR-12)" sat in an MS1 module although MS1 excludes FR-12 and the MVP shows only the first card (RD-11). | Integrated (FR-10, RD-18) |
| 2026-11-10 | The Module 5 exit "UT-15…UT-22" required both UT-18 (Better: `FLIP` toggles) and UT-19 (MVP: `FLIP` on back stays back), which no single reducer passes; MS1 listed FR-11 but not Module 5. Exits that span tiers must be split per tier, as Module 7 already does. | Integrated (Module 5 exit, §III.5 MS1, RD-19; TESTSPEC §5) |
| 2026-11-10 | The Module 6 exit named E2E-03, which needs the tappable card of a later module (FR-15, Module 7) and FR-16 (Better). An exit may only name tests that the module and the ones before it can pass; check this when writing an exit, not when reaching it. | Integrated (Module 6 and Module 7 exits, RD-20; TESTSPEC E2E-03, E2E-15) |
| 2026-11-10 | The iOS Safari 13 target (NFR-07) has only `webkitAudioContext` and a callback-only `decodeAudioData`; `decodeAudioData` detaches the `ArrayBuffer` it is given, so decoding the preloaded bytes directly would empty them; jsdom has no Web Audio, so UT-23 installs a fake `AudioContext` on `window`. | Integrated (FR-13; `tests/unit/audioPlayer.test.ts`) |
| 2026-11-10 | The `missing-image`, `missing-audio` and `long-word` variants targeted `cat`/`bear`, and E2E-14 said "reveal all", but the MVP shows only card 0 (RD-11), so MS1 could not exercise them. Fixtures and test steps have tiers too: a variant's target must be reachable in the tier of every test that uses it. | Integrated (RD-22; TESTSPEC §3.2, E2E-02, E2E-14) |
| 2026-11-10 | `0.7 × 360 × 4/3` (the 640×360 vector) is `335.99999999999994` in IEEE 754, so a plain `Math.floor` gives 335 instead of the §U.7 value 336; `cardSize` floors `value + 1e-6`. | Integrated (`src/ui/computeLayout.ts`; TESTSPEC UT-33) |
| 2026-11-10 | jsdom resolves `object-fit` from an injected stylesheet but not `var()`-based values (so the 4 px border is checked in a real browser, E2E-03); `HTMLCanvasElement.getContext` is not implemented and reports through `console.error`, so tests stub it to `null`; `<img>` never loads, so tests dispatch `error` themselves. | Integrated (`tests/component/Card.test.tsx`, `tests/integration/boot.test.tsx`; TESTSPEC CT-01, IT-03, E2E-03) |
| 2026-11-10 | `dist/merged` holds only the primary fixtures, so real-browser checks of a variant need their own tree (`mergeVariant`: `dist/standalone` + `fixtures/variants/<name>` in a temporary directory); `scrollHeight`/`clientHeight` round subpixel line boxes (1.2 × 18 px), so overflow checks allow 1 px. | Integrated (`tests/e2e/helpers.ts`; TESTSPEC §3.3, E2E-14) |
| 2026-11-10 | IT-05 ("navigate to card 4, remount") sat in the Module 5 Better exit, but nothing in the UI changes the index before the FR-17 arrows (Module 8) — the third exit that named a step a later module provides (after RD-20, RD-22). | Integrated (Module 5 and Module 8 exits, RD-23; TESTSPEC IT-05); needs strengthening: check every Better/Great exit for steps that need later modules before starting it |
| 2026-11-10 | jsdom gives `window.localStorage` as `undefined` on a `file:` URL (opaque origin), while Chromium on `file://` and the container WebView provide it (CR§2.2); the integration tests install an in-memory `Storage` stand-in, and a real-browser reload check confirmed resume on `file://`. | Integrated (`tests/integration/boot.test.tsx`; TESTSPEC IT-05) |
---

## Spec change log
<!-- Newest first. Format: 2026-MM-DD — <author> — <one-sentence description of change> -->

2026-11-10 — Copilot — Recorded Module 5 (Better: FR-12 with FR-16) and the Module 7 Better exit as done and approved (MS2 in progress), detailed FR-12 (`progress.ts` `saveProgress`/`restoreIndex`, saving from `DeckProvider`'s `onIndexChange`, warnings) and FR-10 step (4), tied FR-16 to the FR-15 handler, moved IT-05's navigation part and E2E-06 to the Module 8 exit (RD-23), and added two Lessons Log entries.

2026-11-10 — Copilot — Recorded Module 7 as done and approved and MS1 as approved, detailed FR-14 (`CurrentCard`, `cardSize`/`useViewport`, `fitText`, text-node word, per-card image fallback, active face only until FR-21) and FR-15 (keyboard activation, `play` in the gesture handler, one `AudioPlayer` per deck, inert MVP back), scoped the Module 7 MVP exit for AC-06, and added RD-21, RD-22 and four Lessons Log entries.

2026-11-10 — Copilot — Recorded Module 6 as done and approved, detailed the FR-13 `AudioPlayer` contract (`createAudioPlayer`, `webkitAudioContext` fallback, callback decoding of a copy of the bytes, decode cache, cancelling a late decode, bytes read at play time), moved E2E-03 from the Module 6 exit to the Module 7 exits with its Better half as E2E-15 (RD-20), added OQ-13 and two Lessons Log entries.

2026-11-10 — Copilot — Recorded Module 5 (FR-11, MVP) as done and approved, split the Module 5 exit into MVP and Better parts and added Module 5 (FR-11) to MS1 (RD-19), clarified FR-11 no-ops (non-integer `GO_TO`, unchanged state object) and the `DeckProvider`/`useDeck` holder, and added a Lessons Log entry.

2026-11-10 — Copilot — Recorded Module 4 as done and approved, detailed the FR-10 boot contract (result shape, error-code mapping incl. E9, card 0 until FR-12, critical-asset order, background batch after the critical one, per-asset timeouts) as RD-18, extended the §II.4 E9 row to unexpected boot failures, added the Chromium `--allow-file-access-from-files` launch flag to §III.3, and added four Lessons Log entries.

2026-11-10 — Copilot — Recorded Module 3 as done and approved, split FR-08 into file-level (E2) and card-level (drop the card) violations, gave `DeckError` its `code`/`problems` contract and FR-09 an E3 `DeckError`, tightened content-path rules (RD-17), added `tests/globalSetup.cjs` to §III.1, and added three Lessons Log entries.

2026-11-10 — Copilot — Resolved OQ-12 as RD-16: an oversized `card_order` or an unknown order id is skipped/truncated at runtime (FR-09, limit counted after de-duplication) instead of being a deck-level violation, and both now fail `verify:release` (FR-28, NFR-04).

2026-11-06 — Copilot — Recorded Module 2 as done and approved, gave `loadJson` a `timeoutMs`, changed FR-06 to typed preload entries returning a per-URL result map with audio loaded as bytes only, moved audio decoding and the silent-buffer fallback to FR-13, and added two Lessons Log entries.

2026-11-06 — Copilot — Recorded Module 1 as done and approved, clarified the FR-03 result shape, decoding and `userId` length rule and the FR-04 `detectEnv` helper, and added a Lessons Log entry on re-importing boot-time modules in tests.

2026-11-06 — Copilot — Added `README.md` to the §III.1 implementation layout and versioned paths.

2026-11-06 — Copilot — Moved the Curious Reader contract to `docs/reference/`, marked the original brief as local-only, and recorded the public MIT repository and `LICENSE` in §III.1.

2026-11-06 — Copilot — Recorded Module 0 as done and approved (MS1 in progress), switched linting to ESLint 10 flat config, documented fonts, engine output layout, Babel/Jest/Playwright pins and the lockfile audit scope (RD-13…RD-15), added OQ-12 and four Lessons Log entries.

2026-11-05 — Copilot — Initial draft of the DEVSPEC covering functional modules FR-01…FR-29, NFRs, implementation guide, spec-driven workflow, and appendices.
