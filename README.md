# Flashcard

An offline flashcard game for early readers, part of the Curious Learning suite. The front of a
card shows a picture; tapping it flips the card to show the written word and plays its recorded
audio. Built with React + TypeScript as a standalone web bundle that the Curious Reader container
(an Android/iOS WebView) loads from `file://` with no network.

**Status:** Module 0 (toolchain, standalone build, fixtures, offline audit) is done; milestone
MS1 (MVP: first card with tap-to-reveal and audio) is in progress. The app currently shows only
the loading screen. Progress per milestone is tracked in
[DEVSPEC §III.5](docs/specs/DEVSPEC.md#iii5-deliverables-per-milestone-and-status).

## Getting started

Requires Node ≥ 20 and npm ≥ 10.

```bash
npm ci                     # install exactly what package-lock.json pins
npm run fixtures           # generate test content (deck "animals", english + spanish) into fixtures/
npm run dev                # dev server with fixture content merged, see URL below
npm run typecheck && npm run lint
npm test                   # unit + component + integration tests (Jest, with coverage)
npm run build              # standalone container build to dist/standalone/
npm run audit:standalone   # fails on anything that breaks the offline/container rules
npm run build:merged       # dist/merged/ = engine + fixture content, as the container extracts it
npx playwright install chromium
npm run test:e2e           # Playwright against dist/merged/ from file://, network offline
```

Dev URL: <http://localhost:8080/?cr_lang=english&cr_book=animals&cr_user_id=dev>

If a machine policy blocks Playwright's own browser binaries (`spawn EPERM`), run the e2e tests
with the installed Google Chrome instead: `PW_CHANNEL=chrome npm run test:e2e`
(PowerShell: `$env:PW_CHANNEL='chrome'; npm run test:e2e`).

To check offline behavior by hand, open
`dist/merged/index.html?cr_lang=english&cr_book=animals&cr_user_id=dev` from the file system with
the network disabled. Desktop Chrome blocks XHR between `file://` URLs unless started with
`--allow-file-access-from-files`; the container WebView allows it.

## How content is packaged

The game ships as a 3-tier package ("Layout B" in
[docs/reference/third-party-game-spec.md](docs/reference/third-party-game-spec.md)). All three
ZIPs extract into one directory and must merge without overwriting a file:

| Tier | ZIP | Contains |
|---|---|---|
| engine | `flashcard-core.zip` | `index.html`, JS, CSS, fonts |
| core (one per deck) | `flashcard-book-<deck>.zip` | `decks/<deck>/deck.json`, `decks/<deck>/images/*` |
| lang (one per deck × language) | `flashcard-book-<deck>-lang-<lang>.zip` | `lang/<lang>/<deck>.json`, `lang/<lang>/audios/<deck>_<card_id>.<ext>` |

Decks are data, not code: adding a deck or a language means adding content files that follow the
schema in [DEVSPEC §I.2](docs/specs/DEVSPEC.md#i2-data-schema). Production images and recordings
live in `content/`, which is git-ignored and owned by the content team.

`npm run package` and `npm run verify:release` will build and check the upload ZIPs; both
arrive with Module 12 and currently exit with "Not implemented yet". Uploading, promoting and
publishing to the Curious Reader CMS are manual human steps (DEVSPEC FR-29) — never automated
from this repo, and CMS tokens are never committed.

## Offline and container rules

The container runs the game from `file://` with the network blocked, so the build is held to a
strict contract (details in [AGENTS.md](AGENTS.md) and DEVSPEC §II.3):

- Every asset path is relative (`publicPath: './'`); no CDN scripts, fonts or WebSockets.
- Local binaries load through `XMLHttpRequest` on `file://`; `fetch` and Cache Storage are not used there.
- No analytics or feature-flag SDKs, no Sentry, no Service Workers, no `uuid` package.
- No inline `<script>`/`<style>`, no `eval`, no source maps in the shipped bundle.
- Runtime dependencies are `react` and `react-dom` only.

`npm run audit:standalone` and ESLint enforce these rules.

## Project layout

```
src/        game source (app shell, platform, data, state, audio, telemetry, ui)
scripts/    fixtures, merge, audit, packaging tooling
tests/      unit/, component/, integration/ (Jest) and e2e/ (Playwright)
docs/specs/ PRD, DEVSPEC, UISPEC, TESTSPEC — the source of truth
docs/reference/third-party-game-spec.md   Curious Reader container contract (cited as CR§n)
```

Generated and ephemeral: `fixtures/`, `dist/`, `release/`, `coverage/`, `test-results/`,
`playwright-report/` (all git-ignored).

## Dependency maintenance

- Install with `npm ci` and commit `package-lock.json` with every dependency change.
- Babel stays on 7 and Jest on 29 (`babel-jest` 29 requires `@babel/core` 7); React stays on 18
  and TypeScript on 5, as pinned by the DEVSPEC.
- Adding a runtime dependency other than `react`/`react-dom` fails `audit:standalone`.
- There is no CI yet; run the commands under [Getting started](#getting-started) before pushing.

## Working on this repo

Read [AGENTS.md](AGENTS.md) first — it sets out the non-negotiable container rules and the
spec-driven workflow. Then start with [docs/specs/DEVSPEC.md](docs/specs/DEVSPEC.md), which links
to the [PRD](docs/specs/PRD.md), [UISPEC](docs/specs/UISPEC.md) and
[TESTSPEC](docs/specs/TESTSPEC.md). Every task starts from a Spec References block, is built in
DEVSPEC module order and verified against the TESTSPEC; spec changes follow DEVSPEC §III.7.

## License

[MIT](LICENSE). The bundled Noto Sans fonts are licensed under the
[SIL Open Font License 1.1](src/assets/fonts/OFL.txt).
