# Agent instructions

Flashcard is an offline literacy game for children: the front of a card shows an
image, the back shows the written word and plays its audio. It is a TypeScript +
React single-page app built for Curious Learning's Curious Reader container — an
Android/iOS WebView that loads the game from `file://` with no network. That
constraint drives almost every rule below.

The project is **spec-driven**. Module 0 (toolchain, standalone build, fixtures,
audit) is in place; MS1 is in progress — check DEVSPEC §III.5 for current status. Start with
[docs/specs/DEVSPEC.md](docs/specs/DEVSPEC.md); it is the map to everything else.
Do not restate its content here.

## Source of truth

| Document | Role |
|---|---|
| [docs/specs/PRD.md](docs/specs/PRD.md) | What and why (`PR-`, `G-`, `K-`). Never references other spec files. |
| [docs/specs/DEVSPEC.md](docs/specs/DEVSPEC.md) | Requirements (`FR-`/`NFR-`), data schema, module order, directory layout, scripts, spec workflow (§III.7). |
| [docs/specs/UISPEC.md](docs/specs/UISPEC.md) | Screens, tokens, geometry, gestures, animation, Gherkin `AC-` criteria. |
| [docs/specs/TESTSPEC.md](docs/specs/TESTSPEC.md) | Test cases, fixtures, gates, traceability. |
| [docs/reference/third-party-game-spec.md](docs/reference/third-party-game-spec.md) | External container contract, cited as **CR§n**. **Wins over the specs on container behavior.** |
| `docs/Flashcard Spec Brief.md` | Original brief (MVP / Better / Great tiers). Background only. **Local only** — gitignored and not published, so it may be absent in a clone. |

Precedence: CR§ (container behavior) > DEVSPEC > UISPEC > TESTSPEC. When code and
spec disagree, the spec wins unless the spec is deliberately updated first, in
the order DEVSPEC → UISPEC → TESTSPEC. Inspect the code before trusting a summary,
including this file.

## Non-negotiables

- **The game must run offline.** Every request must be to `file:`, `data:` or
  `blob:`. No CDN `<script>`/`<link>`/`@import`/fonts, no WebSockets, no
  Service Workers. On `file://`, load every binary (images, audio, fonts, JSON)
  through `loadBinary()` (XHR) — `fetch`, `<audio>` and `caches` fail there.
  `caches` is touched only in the http branch of `loadBinary.ts`.
- **Forbidden dependencies and strings** (DEVSPEC §II.3): Statsig, GTM/gtag,
  Sentry, Firebase, Mixpanel, Facebook Pixel, Workbox, `uuid` packages.
  `npm run audit:standalone` enforces this — treat it as the contract, not a
  lint suggestion. Runtime dependencies are `react` and `react-dom` only.
- **CSP-safe output.** `publicPath: './'`, no source maps, CSS extracted to a
  file, no inline `<script>`/`<style>`/`style=""` in static HTML, no `eval`.
  Style dynamically through CSSOM (`element.style`) only.
- **Content is data.** No per-deck code. Learner-visible text comes from the
  content files and is rendered as text, never HTML
  (no `dangerouslySetInnerHTML`). The only app-owned strings live in `strings.ts`.
- **Validate launch params before use.** `cr_lang`/`cr_book` must match
  `^[a-z0-9-]{1,64}$` before being put in any path. `cr_user_id` is opaque: never
  validated further, never invented, never persisted, never logged.
- **Never break a child's session.** Missing image/audio/font/card degrades
  (placeholder, silent reveal, system font, skipped card) rather than blocks.
  Only unusable deck data shows an error screen (E1/E2/E3/E9).
- **Packaging is frozen by the container.** The `-core`, `-book-`, `-lang-` ZIP
  tokens and deck-prefixed filenames (`<deck>.json`, `<deck>_<card_id>.<ext>`)
  must merge into one directory with no overwritten file.
- **Live uploads and publishing are human decisions** (CR§8, FR-29). Never
  upload, promote or publish yourself, and never commit credentials or `.env`.

## Do not hand-edit

- `dist/`, `release/`, `coverage/`, `test-results/`, `playwright-report/` — build
  output.
- `fixtures/**` — generated deterministically by `npm run fixtures`. Change
  `scripts/make-fixtures.mjs` instead.
- `content/**` — real production images and recorded audio; durable, gitignored,
  owned by the content team. Do not generate, overwrite or delete it.
- `package-lock.json` — change it only through `npm`.

## Commands worth knowing

Normative script names are in DEVSPEC §III.5; the clean-machine runbook is §III.4.
Use **npm** (Node ≥ 20, npm ≥ 10) and `npm ci`, not pnpm or yarn.

```bash
npm run typecheck && npm run lint   # run before claiming done
npm test                            # Jest: unit + component + integration
npm run build && npm run audit:standalone
npm run build:merged                # dist/merged = engine + fixtures
npm run test:e2e                    # Playwright, file://, offline (PW_CHANNEL=chrome if Playwright's browsers are blocked)
npm run dev                         # ?cr_lang=english&cr_book=animals&cr_user_id=dev
```

`npm run package` and `npm run verify:release` build and check the upload ZIPs
locally; they never upload.

## Architecture notes that are easy to get wrong

- Pure logic (reducer, `computeLayout`, gestures, validation, telemetry shaping)
  stays out of React and is unit-tested. Deck state is a pure reducer; side
  effects — audio, `localStorage`, telemetry — are called from handlers, **never**
  from the reducer.
- Any change of `index` resets `face` to `'front'`. Navigation out of bounds is a
  no-op (no wrap).
- Audio uses one shared Web Audio `AudioContext`, created on the first user
  gesture. It starts at the moment the flip starts, stops on navigation, and
  plays one voice at a time.
- Card IDs contain no underscore (`_` is the audio-filename delimiter).
- Layout is computed in JS (no CSS `aspect-ratio`); targets are Chrome ≥ 80 and
  iOS Safari ≥ 13 — avoid newer APIs without a fallback (`crypto.randomUUID` has
  one in FR-24).
- `window.ReactNativeWebView?.postMessage()` is the `cr_event` bridge. It is a
  silent no-op outside the container (`IN_CONTAINER` false), so its absence is
  not a bug. Telemetry is fire-and-forget and must never throw into gameplay.
- Tiers are staged MVP → Better → Great. Arrows (`NavArrows`) exist only at
  Better and are **deleted** at Great (FR-17, AC-17).
- Use `console.warn('[flashcard] …')` for recoverable issues; no `console.error`
  on happy paths.

## Working agreements

- **Start every task plan with a Spec References block** listing the `PR-`,
  `FR-`/`NFR-`, `U-`/`AC-` and test IDs involved, plus an *Expected spec impact*
  line. Read those sections first. Work with no spec home is added to the specs
  (Draft) before it is built.
- Implement in DEVSPEC module order and verify against the TESTSPEC.
- A task is complete only when its tests pass **and** the owner has reviewed and
  approved it.
- When a task is complete, tested and approved, ask the owner (use `ask_user`)
  to start a new task: **"Update specs for <task>"**. Do not edit the specs as a
  side effect of a code task unless fixing a spec defect needed to proceed.
- Spec-update tasks follow DEVSPEC §III.7 (Status, Last updated, Version bump,
  top-of-log `Spec change log` line, §III.5 milestone status, consistency audit)
  and finish by reporting Added / Changed / Removed per spec.
- Two-tree sync: a file added to the functional tree in DEVSPEC §III.1 is added
  to the implementation layout in the same change.
- Pause for a human before credentials, external writes, publishing, destructive
  work, or any change in product intent.
- [.github/copilot-instructions.md](.github/copilot-instructions.md) carries the
  same workflow rules for Copilot.
