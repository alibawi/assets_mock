# Roadmap — Fixed Assets mock

Source: `docs/source/assets-management-module-plan-ar.md` (plan) and `docs/source/mock-playbook-en.md` (method).
Detailed screen spec: `docs/spec-assets.md`. Progress log: `WORKLOG.md`.

## Architecture
- Vite + React 18 + TypeScript + Tailwind v3; HashRouter; client-side store in `localStorage` (resettable).
- `src/data/` — `types.ts` (plan §3), `calc.ts` (engine §5.1, runs §5.4), `lifecycle.ts` (state machine §4, entries §5.3), `permissions.ts` (§6.3), `seed.ts`.
- `src/components/` — shell (`Layout`), UI kit (`ui`), `ListView`, `Shared` (journal table, transaction modal).
- `src/pages/` — one file per screen group.

## Build order (done = ✅)
| # | Step | Status |
|---|---|---|
| 0 | Shell (ENKI RTL layout, sidebar, top bar, role switcher), UI kit | ✅ |
| 1 | Settings: classes (§3.1), locations tree (§3.3), groups (§3.4) | ✅ |
| 2 | Asset register + asset card in Draft, code generation | ✅ |
| 3 | Engine: schedule generator, capitalization, depreciation board | ✅ |
| 4 | Depreciation runs: simulate / post / reverse + journal | ✅ |
| 5 | Lifecycle: revalue, transfer, pause/resume, sell, dispose, life change | ✅ |
| 6 | Transactions log (audit trail) | ✅ |
| 7 | Reports: register, forecast, by location/custody, disposals, GL reconciliation | ✅ |
| 8 | Permissions matrix + document numbering, dashboard KPIs | ✅ |
| 9 | Gap review against `project-brief.md` / `discovery-ar.md` (not yet received) | ⏳ |
| 10 | Phase 4–5 placeholders if wanted (purchase-bill link, legacy Excel import, maintenance, multi-area) | ⏳ needs decision |
