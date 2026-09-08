# UI/UX Pro Max Design System & Intelligence Specification

This project follows the **UI/UX Pro Max** design intelligence system, adapted for a real-time Medical & Health IoT Telemetry Dashboard connected to Raspberry Pi 4 and Firebase.

---

## 1. Core Archetype & Design Tokens

- **Domain**: Real-time Health IoT, Ergonomic Posture Monitoring & Biometric Telemetry Dashboard.
- **Visual Aesthetic**: Refined Deep Slate Command Center with optical contrast, mathematical padding, and zero visual clutter (anti-slop).
- **Surface Elevation Scale**:
  - `Canvas (L0)`: `#020617` (`bg-slate-950`)
  - `Card Surface (L1)`: `#0f172a` (`bg-slate-900`) with `border border-slate-800/80`
  - `Elevated Surface (L2)`: `#1e293b` (`bg-slate-850` / `bg-slate-800/60`) with `border border-slate-700/60`
  - `Interactive / Hover`: `hover:bg-slate-800 hover:border-slate-700`
- **Functional Semantic Accents**:
  - **Healthy / Optimal / Safe**: Emerald (`emerald-400`, `emerald-500`, `bg-emerald-500/15`, `border-emerald-500/30`)
  - **Live Connectivity / Sync**: Sky (`sky-400`, `sky-500`, `bg-sky-500/15`, `border-sky-500/30`)
  - **Warning / Stale / Attention**: Amber (`amber-400`, `amber-500`, `bg-amber-500/15`, `border-amber-500/30`)
  - **Danger / Critical / Incorrect Posture**: Rose (`rose-400`, `rose-500`, `bg-rose-500/15`, `border-rose-500/30`)
  - **Inactive / Off**: Slate (`slate-400`, `slate-500`, `bg-slate-800/40`)

---

## 2. Typography & Mathematical Scales

- **Primary Font**: `Plus Jakarta Sans`, system sans-serif fallback
- **Monospace Font**: `JetBrains Mono` for BPM, SpO2 percentages, timestamps, and coordinates
- **Type Scale**:
  - **Display / Key Stat Numbers**: `text-2xl sm:text-3xl font-extrabold tracking-tight font-mono`
  - **Card Headers / Section Titles**: `text-sm sm:text-base font-bold tracking-tight text-white`
  - **Body / Descriptive**: `text-xs sm:text-sm text-slate-300 leading-relaxed`
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
5. **Legibility & WCAG AA**: All text against dark surfaces must meet $\ge 4.5:1$ contrast ratio. Never place dim gray text on colored backgrounds.
