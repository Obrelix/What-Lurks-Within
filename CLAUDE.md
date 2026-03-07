# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**What Lurks Within** is a single-page browser app that rearranges every pixel of an uploaded photograph to recreate a different target image. No pixels are added or removed — only positions change. The user watches the pixel migration animated in real time.

Licensed under GPL-3.0.

## Architecture

The entire application lives in a single `index.html` file (~2400 lines) containing inline CSS, HTML, and JavaScript. There is no build system, no bundler, no package manager, and no external JS dependencies. The only external resource is the Google Fonts "Share Tech Mono" font.

### Screens (UI Flow)

The app uses a 4-screen state machine controlled by `showScreen(screenId)` via `body[data-screen]`:

1. **Landing** — Title, glitch animation, "Begin" CTA, "How it works" modal
2. **Setup** — Source image upload, target selection (upload or procedural "fate"), resolution picker (256/512/768), animation pattern picker, "Reveal" button
3. **Animation** — Canvas-based pixel migration with progress bar
4. **Result** — Final image display, download, replay, start over

### JavaScript Sections (in order within `<script>`)

| Section | Lines ~ | Purpose |
|---|---|---|
| CONFIG | 670 | Central constants: colors, resolutions, animation timing, algorithm params |
| APP_STATE | 713 | Mutable singleton: current screen, pixel buffers, mapping, typed arrays |
| Screen Management | 742 | `showScreen()` |
| Toast Notifications | 761 | `showToast()` |
| Noise Canvas | 780 | Full-screen animated noise overlay via `<canvas>` |
| Option Group Helpers | 842 | Delegated click handlers for resolution/pattern/target buttons |
| Image Pipeline | 858 | Upload, cover-crop, `createPixelBuffer()`, `loadImageFromFile()` |
| Procedural Target Generators | 1022 | 5 built-in target patterns (circles, gradient, plasma, checkerboard, noise) |
| Pixel Alchemy | 1208 | Luminance calc, hue calc, sort comparator, `buildMapping()` — the core remapping algorithm |
| Animation Patterns | 1322 | Sort orders: spatial sweep, random scatter, luminance-ordered, spiral |
| Animation Engine | 1386 | `startAnimation()`, typed array setup, easing, batch scheduling, canvas rendering |
| State Management | 1646 | `resetState()`, `retryWithNewPattern()`, URL cleanup |
| Event Listeners | 1735 | `initEvents()` — wires all buttons, drag-and-drop, file inputs |
| Initialisation | 1858 | `init()` on DOMContentLoaded |
| Validation Suite | 1878 | 14 test functions covering all phases, triggered by `?test=true` |

### Core Algorithm (Pixel Alchemy)

`buildMapping()` creates a bijective pixel-index mapping between source and target images:
- Pixels are sorted by luminance (primary) and hue (secondary) using band-based bucketing (`LUMINANCE_BAND_WIDTH`)
- Source and target get independently sorted copies
- The mapping assigns each source pixel position to a target position with matching luminance/hue rank

### Key Data Structures

- **PixelBuffer**: `{ r: Uint8Array, g: Uint8Array, b: Uint8Array, count: number }` — channel-separated pixel data
- **Mapping**: `Uint32Array` — index `i` holds the target position for source pixel `i`
- **Animation typed arrays**: `sourceXY`, `targetXY` (Float32Array), `colors` (Uint8Array), `startTimes` (Float32Array)

<!--
  Behavioral control blocks (XML tags per Anthropic prompt engineering best practices).
  Claude 4.x follows these more reliably than prose instructions.
  Each block explains WHY the constraint exists so Claude can generalize correctly.
-->

<default_to_action>
Implement changes directly rather than suggesting them.
This project is a single index.html file — there is no ambiguity about where edits go.
When asked to add a feature or fix a bug, produce the working code.
</default_to_action>

<avoid_overengineering>
Only make changes that are directly requested. Do not add features, refactor surrounding
code, or make improvements beyond what was asked. Claude 4.x has a documented tendency
to over-engineer (creating extra files, adding unnecessary abstractions, building in
flexibility that was not requested). Resist this — the project is intentionally a single
self-contained file. A bug fix changes only the buggy code. A new feature adds only
what was described.
</avoid_overengineering>

<investigate_before_answering>
Read the relevant section of index.html before answering questions about it or modifying it.
Line numbers shift between sessions, so never trust remembered positions.
</investigate_before_answering>

## Core Rules

These rules exist because past sessions revealed specific failure modes. Each explanation helps you generalize correctly to novel situations.

1. **Read before you write.** The single `index.html` file shifts between sessions, so reading prevents edits based on stale line numbers or mental models. Always re-read the relevant section before modifying it.
2. **Write validations before implementation.** New features need corresponding validation functions in the Validation Suite (line ~1878). Write the validation first to define the contract, then implement the feature. This prevents scope creep and ensures the feature is testable by design.
3. **Fix the implementation, not the validations.** Validation functions represent the specification. If a validation fails, the code is wrong — editing validations to pass hides regressions and breaks the contract with the user.
4. **Plan exact edits before writing code.** Think through which sections of `index.html` will change, which CONFIG keys are needed, which APP_STATE fields are affected, and what edge cases exist — before typing. Thinking through the complete change prevents partial implementations and reduces follow-up corrections.
5. **Run the full validation suite after each change.** Open `index.html?test=true` and confirm all 14 validations pass. Regressions in unrelated sections are the most common bug source because CONFIG and APP_STATE are shared mutable state.
6. **Implement exactly what was asked.** Extra refactoring and speculative features introduce untested code paths. If you notice something else broken, tell the user rather than fixing it unsolicited.
7. **One logical change per commit.** Atomic commits make bisecting and reverting possible. Since there is only one source file, describe the change clearly in the commit message.
8. **Put every magic number in CONFIG.** Scattered literals make tuning impossible and create silent inconsistencies when the same value appears in multiple places. All numeric and color constants belong in the CONFIG object (~line 670).
9. **Check existing patterns in neighboring code** before writing new code, so additions stay consistent with the file's conventions (e.g., JSDoc style, error handling patterns, option group delegation, `// ═══` section banners).
10. **Ask the user when a task is ambiguous** rather than guessing. A wrong guess wastes more time than a clarifying question.

## Workflow

Follow the Explore → Plan → Validate → Code → Commit loop for every code change:

1. **EXPLORE** — Read all relevant sections of `index.html`. Use search to find the exact lines. Do not write any code yet.
2. **THINK HARD** — Form a complete plan. Consider edge cases, performance implications (animation runs at 60fps with potentially 768² pixels), and how the change connects to CONFIG, APP_STATE, and the validation suite. Before writing any code, output your plan by writing to `progress.txt` using the exact structure defined below. Then paste the completed entry as a fenced code block in your response so the user can verify it before you proceed. Step 3 does not begin until the user has seen this output.
3. **WRITE VALIDATIONS FIRST** — Write failing validation functions for the behavior you're about to implement. Add them to the `VALIDATIONS` array. Commit them.
4. **IMPLEMENT** — Write the code that makes the validations pass. Do not modify the validations. Iterate until all validations pass.
5. **VERIFY END-TO-END** — Open the browser, load `index.html`, upload an image, run the full flow (upload → setup → animate → result), and confirm the feature works as a human would experience it. Run `?test=true` to confirm all validations pass. Do not mark a feature complete based on validations alone.
6. **COMMIT** — Commit with message: `git commit -m "[phase-N] what was done"`. Commit after completing each logical change so progress is always recoverable.

For non-code tasks (documentation, analysis, planning), skip steps 3–4 and move from THINK HARD directly to COMMIT or to delivering the result.

## progress.txt Format

Write every `progress.txt` entry using this exact XML structure. Do not add fields, remove fields, or change tag names.

```xml
<progress>
  <phase>Phase number and name — e.g. "Phase 6: New Animation Pattern"</phase>
  <status>IN PROGRESS | BLOCKED | COMPLETE</status>
  <last_completed_step>Exact step label from the Workflow — e.g. "EXPLORE"</last_completed_step>
  <next_step>Exact step label from the Workflow — e.g. "THINK HARD"</next_step>
  <files_read_this_session>Comma-separated list of every file read — e.g. "index.html, progress.txt"</files_read_this_session>
  <plan_summary>
    2–5 sentences. State what will change, which sections of index.html will be touched, and why this approach was chosen over alternatives.
  </plan_summary>
  <blockers>none — or a concrete description of what is blocking progress</blockers>
</progress>
```

**Rules:**
- Write a new entry at session start, after every commit, and whenever status changes
- `files_read_this_session` must list only files you actually read in this session — never infer from memory
- If `status` is `BLOCKED`, the `blockers` field must be non-empty and specific — "unknown" is not acceptable
- `last_completed_step` and `next_step` must use the exact step labels: EXPLORE, THINK HARD, WRITE VALIDATIONS FIRST, IMPLEMENT, VERIFY END-TO-END, COMMIT

## Context Survival

At the start of every session — before any code, planning, or tool use:

1. Read `progress.txt`. Then output the following in your first response:
   - The full contents of the `<plan_summary>` and `<next_step>` fields
   - A one-sentence confirmation that you have read `CLAUDE.md` this session
   - The result of the validation suite status (last known pass/fail state)

2. State explicitly: *"I am about to begin step [X]. Proceeding."*
   If the next step is IMPLEMENT or beyond, wait for the user to confirm before continuing.

3. Resume from the last completed step in `progress.txt`. If you are uncertain whether a step was completed, ask rather than repeating it.

If the context window compacts mid-session, treat it as a new session start. Repeat all three steps above before resuming work. Compaction is not a reason to skip verification.

## Coding Standards

### Structure
- Single `index.html` — all CSS, HTML, and JS are inline. Keep it that way unless the user explicitly requests splitting.
- `'use strict'` at the top of the `<script>` block
- Sections are delimited by `// ═══` comment banners — maintain this convention for all new sections

### Code Quality
- **JSDoc** on every function — `@description`, `@param`, `@returns`
- Naming: `camelCase` for functions/variables, `SCREAMING_SNAKE_CASE` for CONFIG constants
- All constants in the CONFIG object — no magic numbers in function bodies
- All mutable state in the APP_STATE object — no module-level variables outside these two objects
- Use pure functions where possible (e.g., `computeCoverCrop`, `luminance`, `hue`) because they are easier to validate and reason about

### Performance
- Animation targets 60fps with up to 768² (589,824) pixels
- Use typed arrays (`Float32Array`, `Uint8Array`, `Uint32Array`) for pixel data and animation state, because standard arrays cause GC pauses at this scale
- Batch pixel rendering — process pixels in `BATCH_PERCENT` groups per `BATCH_INTERVAL_MS`
- Pre-allocate all typed arrays in `startAnimation()` — avoid allocations inside the render loop because they trigger garbage collection and drop frames
- Use `requestAnimationFrame` for the animation loop

### CSS
- Dark theme with CRT/glitch aesthetic
- All colors use CSS custom properties in `:root`
- Scanline overlay via `body::after`, animated noise canvas, glitch text via `@keyframes glitch`
- Screen visibility controlled by `body[data-screen]` attribute selectors

## Commands

```bash
# Run locally (simplest — just open the file)
# Open index.html directly in a browser

# Run with a local server (avoids file:// CORS if adding fetch-based features)
npx serve . -p 3000

# Run validation suite
# Open index.html?test=true in browser — results log to console

# Git commit convention
git commit -m "[phase-N] description of what was done"
```

## Recovery Procedures

When progress stalls:
- Re-read the relevant section of `index.html` rather than relying on memory or earlier line numbers
- If a validation reveals an unexpected issue, fix the implementation (see Core Rule 3)
- If unsure about a function name or CONFIG key, grep for it in `index.html`
- If a task seems ambiguous, ask the user for clarification
- If the animation loop has performance issues, profile in browser DevTools and check for allocations in the render loop
