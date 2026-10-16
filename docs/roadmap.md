# Roadmap — Fixed Assets mock

Status: first full pass built without the source documents (playbook, module plan, project brief, discovery).
They have not reached this machine yet; once they do, they go in `docs/source/` and `docs/`, and every screen
is reconciled against the plan (fields, labels, workflows) in follow-up commits.

## Done (v0.1)
- Foundation: Vite/React/TS/Tailwind, RTL ENKI ERP shell (sidebar, top bar, page header, toolbar), UI kit, local store with seed data.
- Master data: categories, locations.
- Asset register + asset card (tabs: basic data, value & depreciation schedule, location & custody, technical, movements, attachments, history).
- Transactions: depreciation run, transfer, revaluation, disposal/sale, maintenance — draft → posted → cancelled, with journal preview.
- Dashboard, reports (register by category, roll-forward, custody, warranty), module settings.

## Next
1. Receive the source docs → write `docs/spec-assets.md` and `docs/prompts-assets.md` from the plan.
2. Gap review of each screen against the spec; adjust fields, labels and flows.
3. Owner walkthrough and feedback round.
