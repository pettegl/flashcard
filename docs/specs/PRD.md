# Flashcard — Product Requirements Document (PRD)

**Status:** Draft · **Version:** 1.0.0 · **Last updated:** 2026-11-05

> Status values: `Draft` (written, not yet owner-approved) → `Approved` (owner signed off, not yet fully built) → `Implemented` (shipped product matches this document at the stated version).
> This document is stable by design: it defines **what** and **why**, never **how**. It does not reference other spec filenames.

**Provenance:** Derived from the Curious Learning "Flashcard Interaction — Specification Brief" (v1, B. Burrage, 2017), the Curious Reader third-party game requirements (v1.11), and the Spec-Driven AI Development (SDAD) method.

---

## 1. Summary

**Flashcard** is a children's early-literacy game. A child sees a picture on the front of a card (e.g. an alligator), taps it, and the card flips to show the written word ("Alligator") while the word is spoken aloud. This repeated image ↔ written-word ↔ sound association is the learning mechanism.

It ships as a game inside **Curious Reader**, Curious Learning's offline-first literacy app for children in low-connectivity environments. Content (decks of cards and their languages) is data, not code.

## 2. Goals

| ID | Goal |
|---|---|
| G-1 | Help a child connect an **image** to its **written word** and **spoken word**. |
| G-2 | Let the content team add a new deck or a new language **without any code change**. |
| G-3 | Work **fully offline** on low-end phones/tablets inside Curious Reader. |
| G-4 | Report anonymous usage so Curious Learning can understand engagement. |
| G-5 | Be a **reference implementation** that a new team can rebuild and test from these specs alone. |

## 3. Non-goals

| ID | Not doing (v1) |
|---|---|
| NG-1 | Scoring, quizzes, levels, rewards, or any assessment of the child. |
| NG-2 | Accounts, login, or any personal data collection. |
| NG-3 | Any network use at runtime (content, analytics, updates, fonts). |
| NG-4 | A content-authoring tool or a deck/language picker inside the game (the container's home grid chooses the tile). |
| NG-5 | A separate native (React Native) app — the game runs as a web game in the container. |
| NG-6 | Looping/wrap-around decks, right-to-left layout, and a "replay audio" button (revisit after launch). |
| NG-7 | Parent/teacher dashboards. |

## 4. Users and personas

| ID | Persona | Needs |
|---|---|---|
| PS-1 | **Child learner**, ~3–8 years, pre-literate or early reader; may use a shared low-end Android device; often offline. | Instant, obvious, touch-only interaction. No reading required to use the game. Big targets. Never gets stuck on an error. |
| PS-2 | **Caregiver / teacher** (indirect). | Confidence that the game is safe, offline, and age-appropriate. |
| PS-3 | **Content creator** at Curious Learning. | Add decks/languages by providing images, words, audio, and a card order. |
| PS-4 | **Curious Learning release/data staff.** | Predictable packaging, upload, and trustworthy usage data. |
| PS-5 | **Developer / workshop participant.** | Specs sufficient to rebuild the product and tests from scratch. |

## 5. Product requirements

Tiers follow the original brief: **MVP** (minimum useful), **Better**, **Great**. The shipped v1 product is the **Great** tier plus all **Container** and **Quality** requirements. Priority: **M** = must, **S** = should.

| ID | Tier | Pri | Requirement | Persona |
|---|---|---|---|---|
| PR-01 | MVP | M | A rectangular, bordered display area shows a card's front: an image. | PS-1 |
| PR-02 | MVP | M | Touching the card replaces the image with the written word for that image and plays an audio file saying the word. | PS-1 |
| PR-03 | MVP | M | Images are resized to fit the card area (never cropped or distorted). | PS-1 |
| PR-04 | MVP | M | Cards and their display order come from data files supplied with each deck/language; new content needs no code change. | PS-3 |
| PR-05 | MVP | M | Works for non-English language content. | PS-1, PS-3 |
| PR-06 | Better | M | The child can move to the previous or next card at will, across the whole deck. | PS-1 |
| PR-07 | Better | M | The child can flip a card back and forth as many times as they like. | PS-1 |
| PR-08 | Great | M | Cards appear as a carousel: one full card, with a portion of the previous and next card visible beside it (replaces arrows). | PS-1 |
| PR-09 | Great | M | Tapping the partial previous/next card moves to it. | PS-1 |
| PR-10 | Great | M | Swiping left or right moves through the carousel. | PS-1 |
| PR-11 | Great | M | Flipping is animated (front ↔ back). | PS-1 |
| PR-12 | Container | M | Runs fully offline inside Curious Reader and is delivered as installable content packages. | PS-4 |
| PR-13 | Container | M | Reports anonymous usage through the container's data pipeline, never over the network directly. | PS-4 |
| PR-14 | Quality | S | Resumes where the child left off after the app is closed and reopened. | PS-1 |
| PR-15 | Quality | S | Usable with keyboard and screen readers (accessible names, focus, motion preferences). | PS-1, PS-2 |
| PR-16 | Quality | M | A bad or missing asset (image, audio, one card) never blocks or crashes the game. | PS-1 |

## 6. Success metrics (KPIs)

| ID | Metric | Target |
|---|---|---|
| K-1 | Offline launches that reach an interactive card within 10 s | 100% in release testing |
| K-2 | Blocked-network-call log entries from the game during load and play | 0 |
| K-3 | Tap-to-flip start latency on the reference low-end device | ≤ 100 ms |
| K-4 | Product/UI requirements covered by at least one passing automated test | 100% |
| K-5 | Median cards viewed per session | Baseline to be set after launch (open question) |
| K-6 | Deck completion rate (all cards revealed in one session) | Baseline to be set after launch (open question) |
| K-7 | Blank-screen/crash incidents in first 30 days after launch | 0 |

## 7. Milestones (conceptual)

1. **MVP** — one card, tap to reveal word + audio, data-driven (PR-01…05).
2. **Better** — navigate all cards, flip repeatedly (PR-06, 07).
3. **Great** — carousel, tap/swipe, animated flip (PR-08…11).
4. **Container-ready** — usage reporting, resume, accessibility, resilience (PR-13…16).
5. **Release** — packaged and uploaded to Curious Reader (PR-12).

## 8. Assumptions and dependencies

- Curious Learning staff provide: the permanent game identity (engine slug), the analytics identity, supported language codes, tile icons, and the final publish step.
- Content (images, words, recorded audio) is produced by the content team; this project provides only the player and sample content for testing.
- Minimum device/WebView versions are agreed with Curious Learning (open question).

## 9. Provenance mapping (brief → PRD)

| Brief tier | PRD IDs |
|---|---|
| MVP | PR-01…PR-05 |
| Better | PR-06, PR-07 |
| Great | PR-08…PR-11 |
| (added by container/quality needs) | PR-12…PR-16 |

---

## Spec change log
<!-- Newest first. Format: 2026-MM-DD — <author> — <one-sentence description of change> -->

2026-11-05 — Copilot — Initial draft of the PRD created from the Flashcard brief, the Curious Reader game contract, and SDAD guidance.
