# Flashcard — Development Specification (DEVSPEC)

**Status:** Draft · **Version:** 1.1.1 · **Last updated:** 2026-11-06
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
| `cards[].image` | relative path inside `decks/<deck>/`; no scheme, no leading `/`, no `..`; extension `png\|jpg\|jpeg\|webp\|svg` |
| `card_order` | array of `card_id`; defines display order; ≤ `MAX_CARDS` |

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
| `cards[].card_id` | must match a deck card to be playable |
| `cards[].target_word` | non-empty after trim; ≤ 64 chars; displayed verbatim as **text** (never HTML), case preserved |
| `cards[].audio` | optional; relative path starting `lang/<lang>/audios/`; extension `mp3\|wav`; **no URLs** (CR§2.1, CR§4) |

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
| `MAX_CARDS` | 100 | FR-09 |
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
| FR-03 | MVP | `parseLaunchParams(search)` returns `{lang, deck, userId}`. `lang` and `deck` are required and must match `^[a-z0-9-]{1,64}$`; otherwise result is error **E1**. `userId` is optional opaque text (trimmed; `""` if absent or > 128 chars); never validated further, never invented. Params are never concatenated into a path before validation passes. | PR-04, PR-05 |
| FR-04 | MVP | `IS_FILE_ORIGIN = location.protocol === 'file:'`; `IN_CONTAINER = typeof window.ReactNativeWebView?.postMessage === 'function'`. Computed once at boot. | PR-12 |

**Exit:** unit tests UT-01…UT-05 pass.

### Module 2 — Binary loader and preloader

| ID | Tier | Requirement | PRD |
|---|---|---|---|
| FR-05 | MVP | `loadBinary(url, {timeoutMs})` per CR§2.3: on `file:` use `XMLHttpRequest` (`arraybuffer`; success when status `0` or `200`); on http(s) use `fetch` + Cache Storage. **`caches` is never touched on `file:`.** Rejects on error/timeout. `loadJson(url)` = `loadBinary` + UTF-8 decode + `JSON.parse`. | PR-12, PR-16 |
| FR-06 | MVP | `preload(urls[], {concurrency: PRELOAD_CONCURRENCY})` uses `Promise.allSettled`; a failed asset never rejects the batch. Audio decode failure yields a 1-frame silent `AudioBuffer`. Images preload via `Image()` (relative `src`). Fonts load via `FontFace` from `loadBinary` buffers; failure is non-fatal (system font stack). | PR-16 |

**Exit:** UT-06…UT-09 pass; with one deliberately missing asset, boot still reaches the ready screen (IT-03).

### Module 3 — Deck data

| ID | Tier | Requirement | PRD |
|---|---|---|---|
| FR-07 | MVP | `validateDeck(json, deck)` enforces §I.2.1. Any violation → throws `DeckError` listing every problem. | PR-04 |
| FR-08 | MVP | `validateWords(json, deck, lang)` enforces §I.2.2 likewise. | PR-04, PR-05 |
| FR-09 | MVP | `buildPlayableCards(deck, words)`: iterate `card_order`; skip (with `console.warn('[flashcard] …')`) ids missing from `cards` or from `words`; drop later duplicates in `card_order`; result length ≤ `MAX_CARDS` (excess truncated with a warning). Empty result → error **E3**. A deck-level schema violation → **E2**. Per-card problems (missing word/audio/image) are never fatal. | PR-04, PR-16 |

**Exit:** UT-10…UT-14 pass, covering every rule in the tables above.

### Module 4 — Boot and loading gate

| ID | Tier | Requirement | PRD |
|---|---|---|---|
| FR-10 | MVP | Boot sequence: (1) parse params → E1; (2) in parallel `loadJson` deck + words (timeout `LOAD_GATE_MS`) → any failure E2; (3) `buildPlayableCards` → E2/E3; (4) restore progress (FR-12); (5) preload *critical* assets = fonts + images and audio of current card ±1, with `Promise.race` against `LOAD_GATE_MS`; (6) render ready UI; (7) continue preloading the rest in the background. The loading screen **never** depends on network and always clears within `LOAD_GATE_MS` of step 2 finishing. | PR-12, PR-16 |

**Exit:** IT-01, IT-02, IT-04 pass; E2E-01 shows loading screen cleared in < 10 s offline.

### Module 5 — Deck state and persistence

| ID | Tier | Requirement | PRD |
|---|---|---|---|
| FR-11 | MVP | Pure reducer `{cards, index, face: 'front'\|'back'}`. Actions: `FLIP`, `NEXT`, `PREV`, `GO_TO(i)`. Rules: navigation actions that leave bounds `[0, n-1]` are no-ops (no wrap — pending OQ-5); **any change of `index` sets `face` to `'front'`** (RD-9); `GO_TO(current)` is a no-op. `FLIP` — **MVP:** `front→back` only; **Better+:** toggles (FR-16). | PR-02, PR-06, PR-07 |
| FR-12 | Quality | After each `index` change write `{card_id}` to `localStorage[STORAGE_KEY_PREFIX:<lang>:<deck>]` in try/catch. At boot, restore if the stored `card_id` exists in the playable list; otherwise index `0`. Corrupt JSON or throwing storage → index `0`, no error. Face always starts `front`. | PR-14 |

**Exit:** UT-15…UT-22 pass.

### Module 6 — Audio

| ID | Tier | Requirement | PRD |
|---|---|---|---|
| FR-13 | MVP | `AudioPlayer` uses one shared Web Audio `AudioContext` (created lazily on the first user gesture; `resume()` if suspended). `play(cardId)` stops any currently playing source, then starts the card's decoded buffer. `stop()` is called on any navigation and on flip to front. A card with no/failed audio plays nothing and raises no error. Buffers are decoded from `loadBinary` data. Audio starts **at the moment the flip starts** (not after the animation). | PR-02, PR-16 |

**Exit:** UT-23 passes; E2E-03 observes exactly one `AudioBufferSourceNode.start` per reveal.

### Module 7 — MVP card (see UISPEC §U.5)

| ID | Tier | Requirement | PRD |
|---|---|---|---|
| FR-14 | MVP | The card renders the current `PlayableCard`: front = image (scaled to fit, UISPEC §U.5), back = `word` text only, bordered display area. A failed image load shows the placeholder (UISPEC §U.5) and the card stays operable. **MVP shows the first card only** (navigation arrives in Better). | PR-01, PR-03, PR-05, PR-16 |
| FR-15 | MVP | Activating the card while `face='front'` dispatches `FLIP` and calls `AudioPlayer.play`. | PR-02 |
| FR-16 | Better | Activating the card while `face='back'` dispatches `FLIP` (→ front) and calls `AudioPlayer.stop`; no audio plays. Unlimited repetition; audio plays on **every** `front→back`. | PR-07 |

**Exit (MVP):** AC-05…AC-10 pass. **Exit (Better, FR-16):** AC-11, AC-12 pass.

### Module 8 — Better navigation

| ID | Tier | Requirement | PRD |
|---|---|---|---|
| FR-17 | Better | `NavArrows` (UISPEC §U.6) dispatch `PREV`/`NEXT`; disabled at the ends. **Retired in Great:** component, styles, and tests are deleted when FR-18 ships. | PR-06 |

**Exit:** AC-13, AC-14 pass; at Great, AC-17 passes (no arrows exist).

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
| FR-28 | Release | `npm run verify:release` checks: names/tokens; engine ZIP has root `index.html` and no `lang/`/`decks/`; core ZIP only `decks/<deck>/**`; lang ZIP only `lang/<lang>/**`; all ZIPs extract into one directory with no overwritten path; every referenced image/audio exists; images and the tile icon are **true PNG/JPEG/WebP by magic bytes** matching their extension; no `.map`; no absolute `src="/`/`url(/`; no `http(s)://` in JSON data; no forbidden strings in the bundle (§II.3). | PR-12 |
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
| NFR-04 | **Asset budgets (guidance enforced by `verify:release` warnings):** image ≤ 300 KB and ≤ 1600 px on the long side; audio ≤ 200 KB and ≤ 5 s; deck ≤ `MAX_CARDS`; each ZIP ≤ `ZIP_MAX_BYTES`. |
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
| Image fails to load | Placeholder face; card still flips |
| Audio missing/undecodable | Silent reveal |
| Font fails | System font stack |
| `localStorage` unavailable/corrupt | Start at card 0 |
| `AudioContext` unavailable | Silent reveal |
| `postMessage` throws / outside container | Swallowed; no-op |
| Envelope > 64 KB | Dropped with warning |
| Unhandled React error | Error boundary shows E2-style screen with code **E9**; telemetry untouched |

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
LICENSE                              MIT
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
fixtures/content/{decks/animals/**,lang/english/**,lang/spanish/**}   generated
fixtures/variants/<name>/**                                           generated (failure/edge variants, TESTSPEC §3.2)
content/{decks/<deck>/**,lang/<lang>/**,icons/<deck>-<lang>.png}     production content
```

**Engine output** (`dist/standalone/` = the content of `flashcard-core.zip`): `index.html`, `js/main.<hash>.js` (+ `main.<hash>.js.LICENSE.txt`), `css/main.<hash>.css`, `fonts/NotoSans-{Regular,Bold}.woff2`, `fonts/OFL.txt`. Runtime font URLs are `./fonts/NotoSans-<Weight>.woff2` (FR-06).

| Path | Class | Rule |
|---|---|---|
| `src/`, `scripts/`, `tests/`, `docs/`, configs, `LICENSE`, `src/assets/fonts` | **Versioned** | committed to the public repository `github.com/pettegl/flashcard` (MIT) |
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
| Playwright (full Chromium, new headless mode: `channel: 'chromium'`) | `file://` + offline + viewport + emulated touch e2e. `PW_CHANNEL=chrome` runs the installed Google Chrome where a machine policy blocks Playwright's own binaries |
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
| MS1 | MVP | 0–4, 6, 7 (FR-01…FR-11, FR-13…FR-15) | First card tap-to-reveal with audio from fixtures | AC-01…AC-10 | In progress (Module 0 Done (tested) and Approved 2026-11-06; Modules 1–4, 6, 7 Not started) |
| MS2 | Better | 5 (FR-12), FR-16, 8 (FR-17) | Arrows, repeatable flip, resume | AC-11…AC-14, AC-36 | Not started |
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
| OQ-12 | A `card_order` longer than `MAX_CARDS`: deck-level violation (§I.2.1, UT-11 → `DeckError` → **E2**) or truncation with a warning (FR-09, UT-14, fixture `bigdeck-120`)? The two rules contradict each other. | FR-07, FR-09, UT-11, UT-14 (Module 3) | Truncate with a warning (FR-09 wins; design principle II.1.3 "a child is never stuck"); remove `> MAX_CARDS` from §I.2.1 and UT-11 when resolved |

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

---

## Spec change log
<!-- Newest first. Format: 2026-MM-DD — <author> — <one-sentence description of change> -->

2026-11-06 — Copilot — Moved the Curious Reader contract to `docs/reference/`, marked the original brief as local-only, and recorded the public MIT repository and `LICENSE` in §III.1.

2026-11-06 — Copilot — Recorded Module 0 as done and approved (MS1 in progress), switched linting to ESLint 10 flat config, documented fonts, engine output layout, Babel/Jest/Playwright pins and the lockfile audit scope (RD-13…RD-15), added OQ-12 and four Lessons Log entries.

2026-11-05 — Copilot — Initial draft of the DEVSPEC covering functional modules FR-01…FR-29, NFRs, implementation guide, spec-driven workflow, and appendices.
