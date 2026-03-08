# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**What Lurks Within** is a single-page browser app that rearranges every pixel of an uploaded photograph to recreate a different target image. No pixels are added or removed — only positions change. The user watches the pixel migration animated in real time.

Licensed under GPL-3.0.

## Architecture

The application is split into ES modules with no build system, no bundler, no package manager, and no external JS dependencies. The only external resource is the Google Fonts "Share Tech Mono" font.

**Important:** ES modules require a local server (`npx serve . -p 3000`). `file://` protocol will not work.

### File Structure

```
index.html              (132 lines — HTML only, screen markup)
css/styles.css          (600 lines — all CSS)
js/
  main.js               (entry point — imports + init)
  config.js             (CONFIG object + TESTING flag)
  state.js              (APP_STATE mutable singleton)
  utils.js              (pure functions: luminance, hue, easing, shuffle, comparator)
  events.js             (initEvents — wires all buttons, drag-and-drop, file inputs)
  state-management.js   (resetState, downloadResult, tryAgain)
  ui/
    screens.js          (showScreen)
    toast.js            (showToast)
    noise.js            (initNoiseCanvas — VHS noise overlay)
    options.js          (initOptionGroup — button group delegation)
  image/
    pipeline.js         (cover crop, pixel buffer, loadImageFromFile, upload handlers)
    procedural.js       (5 procedural target generators + PROCEDURAL_GENERATORS array)
    matching.js         (histogram matching, rankAndFilter, loadBestMatchingDefaultImage)
  algorithm/
    pixel-alchemy.js    (buildPixelDescriptors, buildMapping — core remapping)
    patterns.js         (sortMappingByPattern — spatial sweep, random, luminance, spiral)
  animation/
    engine.js           (buildAnimationArrays, startReveal, animationLoop, finishAnimation)
  validation/
    validations.js      (all validation functions — dynamically imported with ?test=true)
```

### Dependency Graph (import direction →)

```
main.js → config, ui/screens, ui/noise, events, validation/validations (dynamic)
config.js → (leaf)
state.js → config
utils.js → config
ui/screens → state
ui/toast → config
ui/noise → config, state, ui/toast
ui/options → (leaf)
image/pipeline → config, state, ui/toast, ui/screens
image/procedural → image/pipeline
image/matching → config, state, image/pipeline, image/procedural
algorithm/pixel-alchemy → utils
algorithm/patterns → utils
animation/engine → config, state, utils, ui/screens, ui/toast, algorithm/*
state-management → config, state, ui/screens, ui/toast, animation/engine
events → state, ui/*, image/*, animation/engine, state-management
```

No circular dependencies.

### Screens (UI Flow)

The app uses a 4-screen state machine controlled by `showScreen(screenId)` via `body[data-screen]`:

1. **Landing** — Title, glitch animation, "Begin" CTA, "How it works" modal
2. **Setup** — Source image upload, target selection (upload or procedural "fate"), resolution picker (256/512/768), animation pattern picker, "Reveal" button
3. **Animation** — Canvas-based pixel migration with progress bar
4. **Result** — Final image display, download, replay, start over

### Core Algorithm (Pixel Alchemy)

`buildMapping()` in `js/algorithm/pixel-alchemy.js` creates a bijective pixel-index mapping between source and target images:
- Pixels are sorted by luminance (primary) and hue (secondary) using band-based bucketing (`LUMINANCE_BAND_WIDTH`)
- Source and target get independently sorted copies
- The mapping assigns each source pixel position to a target position with matching luminance/hue rank

### Key Data Structures

- **PixelBuffer**: `{ width, height, data: Uint8ClampedArray, count: number }` — RGBA pixel data
- **Mapping**: `Array<{ sourceIndex, targetIndex, r, g, b, a, luminance }>` — pixel-level mapping
- **Animation typed arrays**: `sourceXY`, `targetXY` (Float32Array), `colors` (Uint8ClampedArray), `startTimes` (Float64Array)

<!--
  Behavioral control blocks (XML tags per Anthropic prompt engineering best practices).
  Claude 4.x follows these more reliably than prose instructions.
  Each block explains WHY the constraint exists so Claude can generalize correctly.
-->

<default_to_action>
Implement changes directly rather than suggesting them.
When asked to add a feature or fix a bug, produce the working code.
Identify the correct module file(s) from the file structure above.
</default_to_action>

<avoid_overengineering>
Only make changes that are directly requested. Do not add features, refactor surrounding
code, or make improvements beyond what was asked. A bug fix changes only the buggy code.
A new feature adds only what was described.
</avoid_overengineering>

<investigate_before_answering>
Read the relevant module file(s) before answering questions about them or modifying them.
Use the file structure above to identify which file(s) contain the code in question.
</investigate_before_answering>

## Core Rules

These rules exist because past sessions revealed specific failure modes. Each explanation helps you generalize correctly to novel situations.

1. **Read before you write.** Always re-read the relevant module file before modifying it.
2. **Write validations before implementation.** New features need corresponding validation functions in `js/validation/validations.js`. Write the validation first to define the contract, then implement the feature.
3. **Fix the implementation, not the validations.** Validation functions represent the specification. If a validation fails, the code is wrong — editing validations to pass hides regressions.
4. **Plan exact edits before writing code.** Think through which module files will change, which CONFIG keys are needed, which APP_STATE fields are affected, and what edge cases exist — before typing.
5. **Run the full validation suite after each change.** Open `index.html?test=true` (via local server) and confirm all validations pass.
6. **Implement exactly what was asked.** Extra refactoring and speculative features introduce untested code paths. If you notice something else broken, tell the user rather than fixing it unsolicited.
7. **One logical change per commit.** Atomic commits make bisecting and reverting possible.
8. **Put every magic number in CONFIG.** All numeric and color constants belong in `js/config.js`.
9. **Check existing patterns in neighboring code** before writing new code, so additions stay consistent with the module's conventions (e.g., JSDoc style, error handling patterns, `// ═══` section banners).
10. **Ask the user when a task is ambiguous** rather than guessing. A wrong guess wastes more time than a clarifying question.

## Workflow

Follow the Explore → Plan → Validate → Code → Commit loop for every code change:

1. **EXPLORE** — Read the relevant module file(s). Use search to find the exact location. Do not write any code yet.
2. **THINK HARD** — Form a complete plan. Consider edge cases, performance implications (animation runs at 60fps with potentially 768² pixels), and how the change connects to CONFIG, APP_STATE, and the validation suite. Before writing any code, output your plan by writing to `progress.txt` using the exact structure defined below. Then paste the completed entry as a fenced code block in your response so the user can verify it before you proceed. Step 3 does not begin until the user has seen this output.
3. **WRITE VALIDATIONS FIRST** — Write failing validation functions in `js/validation/validations.js`. Commit them.
4. **IMPLEMENT** — Write the code that makes the validations pass. Do not modify the validations. Iterate until all validations pass.
5. **VERIFY END-TO-END** — Open the browser (via local server), load `index.html`, upload an image, run the full flow (upload → setup → animate → result), and confirm the feature works as a human would experience it. Run `?test=true` to confirm all validations pass.
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
  <files_read_this_session>Comma-separated list of every file read — e.g. "js/config.js, js/state.js"</files_read_this_session>
  <plan_summary>
    2–5 sentences. State what will change, which module files will be touched, and why this approach was chosen over alternatives.
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
- ES modules: each file has `'use strict'` at the top and uses `import`/`export`
- `index.html` is HTML only — no inline JS or CSS
- `css/styles.css` contains all CSS
- Sections within files are delimited by `// ═══` comment banners
- **Max file length: 200 lines** — split beyond that (except `validation/validations.js` which is test-only)
- **Max function length: 30 lines** — extract named helpers beyond that
- **Max nesting depth: 3 levels** — flatten with early returns

### Code Quality
- **JSDoc** on every class and public method — `@param`, `@returns`, `@fires`, `@listens`
- Naming: `camelCase` functions/variables · `PascalCase` classes · `SCREAMING_SNAKE_CASE` constants
- All constants in the CONFIG object (`js/config.js`) — no magic numbers in function bodies
- All mutable state in the APP_STATE object (`js/state.js`) — no module-level mutable variables outside these two objects
- Pure functions in `js/utils.js` — zero side effects
- Use pure functions where possible because they are easier to validate and reason about

### Performance
- Animation targets 60fps with up to 768² (589,824) pixels
- Use typed arrays (`Float32Array`, `Uint8ClampedArray`, `Uint32Array`) for pixel data and animation state, because standard arrays cause GC pauses at this scale
- Pre-allocate all typed arrays in `startReveal()` — avoid allocations inside the render loop because they trigger garbage collection and drop frames
- Use `requestAnimationFrame` for the animation loop

### CSS
- Dark theme with CRT/glitch aesthetic
- All colors use CSS custom properties in `:root`
- Scanline overlay via `body::after`, animated noise canvas, glitch text via `@keyframes glitch`
- Screen visibility controlled by `body[data-screen]` attribute selectors

## Commands

```bash
# Run locally (REQUIRED — ES modules need a server)
npx serve . -p 3000

# Run validation suite
# Open http://localhost:3000/?test=true in browser — results log to console

# Git commit convention
git commit -m "[phase-N] description of what was done"
```

## Recovery Procedures

When progress stalls:
- Re-read the relevant module file rather than relying on memory
- If a validation reveals an unexpected issue, fix the implementation (see Core Rule 3)
- If unsure about a function name or CONFIG key, grep for it across `js/`
- If a task seems ambiguous, ask the user for clarification
- If the animation loop has performance issues, profile in browser DevTools and check for allocations in the render loop
