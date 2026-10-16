# CLAUDE.md — ENKI ERP Fixed Assets mock

Clickable prototype of the Enki Fixed Assets (الموجودات الثابتة) module. Source of truth for behaviour:
`docs/source/assets-management-module-plan-ar.md`. Method: `docs/source/mock-playbook-en.md`.

Stack (deviation from playbook §2, see WORKLOG): Vite + React 18 + TypeScript + Tailwind v3, client-side store
persisted to `localStorage` (`src/data/store.tsx`), HashRouter. `npm run dev` / `npm run build`.

## Mandatory rules (playbook §5)

1. **Component reuse.** Every screen uses the shared components in `src/components/`. If a variation is needed, extend the shared component with props — never duplicate it.
2. **Mock data through the store only.** Seed data lives in `src/data/seed.ts` and is read exclusively through `useStore()`; business rules live in `src/data/lifecycle.ts` / `calc.ts`. Pages never hard-code data arrays.
3. **Five-screen pattern per module:** List → Detail → Create/Edit → Activity log / Audit trail → Module KPIs.
4. **Theme and direction safety.** Use logical properties (`ps-`, `pe-`, `start-`, `end-`, `text-start`) instead of `pl-`, `pr-`, `left-`, `right-`. Colours come from Tailwind theme tokens (`navy`, `line`, `page`).
5. **WORKLOG.md.** Read it from the top before any work. After every task, append an entry at the bottom. Append-only.
6. **Realistic, connected data.** Iraqi locale, IQD, real-looking names; entities reference each other by ID.
7. **Small commits.** Conventional Commits: `feat(assets): ...`, `fix: ...`, `chore: ...`, `docs: ...`.
8. **No invented requirements.** If the plan is silent or contradictory, log it in WORKLOG and ask.
