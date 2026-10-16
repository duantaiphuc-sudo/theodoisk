# Claude Code & AI Agent Configuration

This repository adopts Matt Pocock's skills framework (`mattpocock/skills`) alongside UI/UX Pro Max standards.

Please refer to [AGENTS.md](./AGENTS.md) for full project specifications, design tokens, and agent skills guidelines.

## Quick Reference

### Issue tracker
Local markdown issues tracked in `.scratch/`. See `docs/agents/issue-tracker.md`.
- Specs: `.scratch/<feature-slug>/spec.md`
- Tickets: `.scratch/<feature-slug>/issues/<NN>-<slug>.md`

### Triage labels
Canonical 5-role triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs
Single-context layout (`CONTEXT.md` + `docs/adr/`). See `docs/agents/domain.md`.

### Core Engineering Skills
Skills are located in `.claude/skills/` and `.agents/skills/`.
- `/grill-with-docs` -> `/to-spec` -> `/to-tickets` -> `/implement` -> `/code-review`
- `/tdd` for test-first development at declared seams
- `/improve-codebase-architecture` for modular depth and boundaries
- `/diagnosing-bugs` for bug analysis

### Verification Commands
- `npm run typecheck` (`tsc --noEmit`)
- `npm run test` (`vitest run`)
- `npm run lint` (`tsc --noEmit`)
- `npm run build` (`vite build`)
