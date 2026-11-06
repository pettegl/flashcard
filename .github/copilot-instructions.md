# Copilot instructions — Flashcard (spec-driven development)

This project follows Spec-Driven AI Development. The specs in `docs/specs/` are the source of truth:

| Spec | Purpose |
|---|---|
| `PRD.md` | What and why (stable; never references other spec files) |
| `DEVSPEC.md` | Functional/non-functional requirements, data schema, module order, implementation guide, spec workflow (§III.7) |
| `UISPEC.md` | Screens, tokens, geometry, gestures, animation, Gherkin acceptance criteria |
| `TESTSPEC.md` | Test cases, fixtures, gates, traceability |

External container contract: `docs/reference/third-party-game-spec.md` (cited as CR§n) wins on container behavior.

## For every new task

1. Start the task plan with a **Spec References** block listing the `PR-`, `FR-`/`NFR-`, `U-`/`AC-`, and test IDs involved, and an **Expected spec impact** line. Read those spec sections before planning.
2. Implement in the DEVSPEC module order; verify with the TESTSPEC. When code and spec disagree, the spec wins unless the spec is deliberately updated first (order: DEVSPEC → UISPEC → TESTSPEC).
3. A task is complete only when its tests pass and the owner has reviewed and approved it.
4. **When a task is complete, tested and approved, prompt the owner (use `ask_user`) to start a new task: "Update specs for <task>".** Do not edit the specs as a side effect of the code task unless it is fixing a spec defect needed to proceed.

## Spec-update task requirements

For every spec altered:
- Update **Status** (`Draft` → `Approved` → `Implemented`) and **Last updated** (today's date).
- Bump **Version** (patch = typo/clarification, minor = new or changed requirements).
- Add a line at the **top** of the "Spec change log" at the bottom of that spec, in exactly this format: `2026-MM-DD — <author> — <one-sentence description of change>`.
- Update DEVSPEC §III.5 milestone status; move resolved Open Questions to Appendix B; process the Lessons Log.
- Run the cross-section consistency audit (DEVSPEC §III.6).

When finished, **return a list of all changes per spec: Added, Changed, Removed (name the removed text/IDs)**, plus the new Status / Version / Last-updated values.
