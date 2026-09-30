# UI/UX Pro Max Design System & Intelligence Specification (Light Theme Edition)

This project follows the **UI/UX Pro Max** design intelligence system, adapted for a real-time Medical & Health IoT Telemetry Dashboard connected to Raspberry Pi 4 and Firebase, running in **Full Light Mode (Giao diện sáng)**.

---

## 1. Core Archetype & Design Tokens (Light Mode)

- **Domain**: Real-time Health IoT, Ergonomic Posture Monitoring & Biometric Telemetry Dashboard.
- **Visual Aesthetic**: Refined Modern Clinical & Executive Light Command Center with optical contrast, mathematical padding, and zero visual clutter (anti-slop).
- **Surface Elevation Scale**:
  - `Canvas (L0)`: `#f8fafc` (`bg-slate-50` / `bg-neutral-50`)
  - `Card Surface (L1)`: `#ffffff` (`bg-white`) with `border border-slate-200/90 shadow-sm`
  - `Elevated Surface (L2)`: `#f1f5f9` (`bg-slate-100`) with `border border-slate-300/80`
  - `Interactive / Hover`: `hover:bg-slate-100/80 hover:border-slate-300`
- **Functional Semantic Accents (Light Mode High Contrast)**:
  - **Healthy / Optimal / Safe**: Emerald (`emerald-600`, `text-emerald-700`, `bg-emerald-50`, `border-emerald-200`)
  - **Live Connectivity / Sync**: Sky (`sky-600`, `text-sky-700`, `bg-sky-50`, `border-sky-200`)
  - **Warning / Stale / Attention**: Amber (`amber-600`, `text-amber-800`, `bg-amber-50`, `border-amber-200`)
  - **Danger / Critical / Incorrect Posture**: Rose (`rose-600`, `text-rose-700`, `bg-rose-50`, `border-rose-200`)
  - **Inactive / Off**: Slate (`text-slate-600`, `bg-slate-100`, `border-slate-200`)

---

## 2. Typography & Mathematical Scales

- **Primary Font**: `Plus Jakarta Sans`, system sans-serif fallback
- **Monospace Font**: `JetBrains Mono` for BPM, SpO2 percentages, timestamps, and coordinates
- **Type Scale**:
  - **Display / Key Stat Numbers**: `text-2xl sm:text-3xl font-extrabold tracking-tight font-mono text-slate-900`
  - **Card Headers / Section Titles**: `text-sm sm:text-base font-bold tracking-tight text-slate-900`
  - **Body / Descriptive**: `text-xs sm:text-sm text-slate-600 leading-relaxed`
  - **Micro / Badges / Meta**: `text-[10px] sm:text-xs font-semibold uppercase tracking-wider`
- **Label Integrity**:
  - Text inside buttons, chips, status pills, or metric badges **MUST sit on one line** with `whitespace-nowrap`.
  - No awkward hyphenation or truncated words on small mobile viewports.

---

## 3. Mobile-First Layout & Touch Optimization (Crucial)

- **Touch Target Standard**: All actionable items (buttons, tab switches, dropdown toggles, modal triggers) MUST have a minimum touch area of **44x44px** on mobile.
- **Mobile Thumb Navigation**:
  - Provide a fluid segmented tab bar or quick view selector on mobile so users can seamlessly switch between **Tổng quan (Overview)**, **Tư thế & Nhịp tim (Biometrics)**, **Thời gian hoạt động (Timers)**, and **Nhật ký dữ liệu (Logs)** without excessive continuous scrolling.
- **Metric Cards Grid**:
  - Mobile: `grid grid-cols-2 gap-2.5 sm:gap-3` (optimized compact cards that display key values boldly without horizontal scroll or clipping).
  - Tablet/Desktop: `lg:grid-cols-4 gap-4 sm:gap-5`.
- **Responsive Padding Formula**:
  - Outer container margin/padding: `px-3 sm:px-6 lg:px-8`.
  - Inner card padding: `p-3.5 sm:p-5 lg:p-6`.
  - Outer container padding always $\ge$ inner child spacing.
  - Nested corner radius rule: `Inner Radius = Outer Radius - Padding`.

---

## 4. Anti-Patterns & Quality Checks (Anti-Slop Directives)

1. **No Clipped Text / Badges**: Every status tag must expand dynamically with its text or use concise wording.
2. **No Arbitrary Purple/Cyan Gradients**: Use purposeful semantic colors tied to medical states.
3. **No Nested Card Clutter**: Flatten depth using crisp 1px borders, subtle dividers, and proportional padding instead of card-inside-card syndrome.
4. **No Horizontal Viewport Overflow**: Ensure zero horizontal scroll on mobile devices (`320px` to `428px` phone widths).
5. **Legibility & WCAG AA**: All text against light surfaces must meet $\ge 4.5:1$ contrast ratio. Never place faint light-gray text on white backgrounds.

---

## Agent skills

Configured using [mattpocock/skills](https://github.com/mattpocock/skills). Agent skills live in `.agents/skills/` and `.claude/skills/`.

### Issue tracker
Local markdown issues tracked in `.scratch/`. See `docs/agents/issue-tracker.md`.
- Specs: `.scratch/<feature-slug>/spec.md`
- Tickets: `.scratch/<feature-slug>/issues/<NN>-<slug>.md`

### Triage labels
Canonical 5-role triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs
Single-context layout (`CONTEXT.md` + `docs/adr/`). See `docs/agents/domain.md`.
Always use the domain terms defined in `CONTEXT.md` and respect ADRs before planning or writing code.

### Core Engineering Workflows (Matt Pocock Spec-Driven System)
1. **The Main Flow**:
   - `/grill-with-docs`: Refine requirements, build the domain model, stress-test edge cases, and update `CONTEXT.md` + ADRs.
   - `/to-spec`: Synthesize context into a specification in `.scratch/<feature>/spec.md` without conversational noise.
   - `/to-tickets`: Decompose spec into numbered, single-responsibility tickets (`.scratch/<feature>/issues/<NN>-<slug>.md`) with explicit seams and blocking dependencies.
   - `/implement`: Execute tickets using `/tdd` (red-green-refactor loop) at pre-agreed seams.
   - `/code-review`: Review changes against specs, run type checks (`npm run typecheck`) and tests (`npm run test`).
2. **Upkeep & Diagnostics**:
   - `/improve-codebase-architecture`: Analyze modular depth, interface leverage, and boundary rules.
   - `/diagnosing-bugs`: Systematic hypothesis-driven diagnostic loop for subtle bugs and regressions.
   - `/triage`: Issue triage state machine (`needs-triage` -> `ready-for-agent` / `ready-for-human` / `needs-info` / `wontfix`).
3. **Verification Commands**:
   - Typecheck: `npm run typecheck` (`tsc --noEmit`)
   - Test: `npm run test` (`vitest run`)
   - Lint: `npm run lint`

