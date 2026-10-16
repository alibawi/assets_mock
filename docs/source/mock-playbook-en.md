# Interactive Mockup Playbook

> **This document is addressed to Claude Code.** The user has handed you this playbook together with a description of a system (technical spec, functional requirements, RFP, business document, or any other format). Your job is to turn that description into a complete, realistic, clickable prototype using the fixed methodology below.
>
> **Read this entire document before doing anything. Do not write code, create files, or scaffold anything until the Discovery phase (Section 3) is complete and the user has approved your plan.**

---

## 0. For Team Members: How to Use This Playbook

1. Create a new **empty** repository (GitHub or similar).
2. Clone it to your machine.
3. Open the folder in Claude Code.
4. Put the system description inside the repo (recommended: `docs/source/`) — PDF, DOCX, MD, or images are all fine.
5. Send Claude a message such as:
   > Follow `mock-playbook-en.md`. The system description is in `docs/source/<file>`.

   (Attach or reference this playbook file.)
6. Answer Claude's discovery questions. The more precise your answers, the better the result. "Use your judgment" is an acceptable answer — Claude will state the default it picks.
7. Review and approve the plan. Claude then builds phase by phase, stopping at defined checkpoints for your review.

---

## 1. Objective and Scope

**Objective:** A clickable prototype that looks and behaves like a real production system — realistic data, loading/empty/error states, filters, forms, validations, and status workflows — used to demo to clients or stakeholders and validate the user experience before any backend is built.

**Out of scope (unless the user explicitly says otherwise):**
- Real backend, database, or persistent storage.
- Real authentication or authorization enforcement.
- Real integrations with external systems (ERP, payment gateways, maps, SMS, email, etc.). These appear as interactive placeholders only.

All data is mock data. Every "save" updates local/in-memory state only.

---

## 2. Default Technology Stack

Use this stack unless the user chooses otherwise during Discovery:

| Concern | Default |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS v4 (no `tailwind.config`; tokens via CSS variables + `@theme inline` in `globals.css`) |
| UI components | shadcn/ui (`npx shadcn@latest add <component>`) |
| Theming | `next-themes` |
| Icons | `lucide-react` |
| Mock backend | Next.js Route Handlers under `app/api/` reading JSON from `mock-data/` |

---

## 3. Phase 1 — Discovery (MANDATORY, before any work)

This is the most important phase. A mockup built on wrong assumptions is wasted effort. **Ask first, build later.**

### 3.1 Procedure

1. **Read the entire system description first**, end to end. Do not ask questions that the document already answers.
2. Produce a short **Understanding Summary** for the user (10–15 bullet points): what the system is, who uses it, the main modules you identified, and the key workflows.
3. Ask the **Discovery Questions** (Section 3.2), plus any **document-specific questions** arising from gaps, ambiguities, or contradictions in the description.
   - Ask in **batches of related questions** (roughly 4–8 per batch), not one giant wall.
   - Use the `AskUserQuestion` tool when available; offer concrete options with a recommended default marked.
   - For every question, state **the default you will use if the user has no preference**.
4. After all answers are in, write a **Project Brief** to `docs/project-brief.md` capturing every decision, and ask the user to confirm it.
5. Only then proceed to Phase 2 (Planning).

**Golden rule:** If anything in the description is missing, ambiguous, or contradictory — at any point in the project — log it in `WORKLOG.md` and ask the user. **Never invent requirements.**

### 3.2 Discovery Questions

Cover all of the following. Skip a question only if the description answers it unambiguously (and say so in the Understanding Summary).

**A. Context & Audience**
1. What is the system's official name (and short name / acronym, if any)?
2. Who is the client or organization? What sector (government, banking, healthcare, education, logistics, ...)?
3. Who is the audience for this mockup (executive demo, client sign-off, UX validation, investor pitch, internal tender)?
4. Is there a deadline or demo date? Should we prioritize breadth (all modules shallow) or depth (fewer modules fully working)?

**B. Scope**
5. Here is the module list I extracted — confirm, add, remove, merge, or rename.
6. Which modules are highest priority / must be demo-ready first?
7. Are any modules out of scope for this mockup, or should they appear as "Coming Soon" in the navigation?
8. Are there specific workflows or scenarios that must be demonstrated end to end during the demo?

**C. Users & Roles**
9. What user roles exist? (Propose a list extracted from the description.)
10. Should switching roles change what the user sees (menus, buttons, data) or is it cosmetic only?
11. Is a login screen required? Should it be a mock login with a role picker?

**D. Platform & Interfaces**
12. Target platform: desktop web, responsive web, mobile-first, tablet, or multiple distinct interfaces (e.g., admin portal + field app + public portal)?
13. If there are multiple interfaces, should they live in one app (separate route groups) or separate apps?

**E. Language & Localization**
14. Which languages? Single language or bilingual with a toggle?
15. Text direction: RTL, LTR, or both?
16. Preferred fonts per language, if any?
17. Language for project documentation (`docs/`, `WORKLOG.md`, commit messages)? Default: English.

**F. Brand & Visual Identity**
18. Brand colors (hex): primary, accent, secondary — or should I propose a palette?
19. Logo files available? (Place them in `public/brand/`.) Is the logo dark-on-light (needs a white card in dark mode)?
20. Light mode, dark mode, or both with a toggle? Which is the default?
21. Any reference designs, screenshots, existing systems, or style guides to follow?
22. Visual tone: formal/governmental, modern/corporate, minimal, dense data-heavy?

**G. Data & Realism**
23. What locale should mock data reflect (country, cities, names, currency, date format, phone formats, ID formats)?
24. Approximate data volume per list (e.g., 20, 50, 200 records)?
25. Are there real sample documents, forms, reference numbers, or organizational structures I should mirror?
26. Any sensitive terms or data that must NOT appear?

**H. Special Features**
27. Does the system need maps, charts, calendars, kanban boards, file uploads/previews, signatures, QR codes, notifications, or printing/exports? Which should be real-looking vs. simple placeholders?
28. Any external integrations that should appear as placeholders?

**I. Delivery**
29. How will the mockup be shared: local run only, Vercel/Netlify deployment, or static export?
   - Note: on serverless hosting, in-memory API state resets between requests. If deploying, prefer client-side state (e.g., a store seeded from the API) for anything that must persist during a demo session.
30. Should I commit and push after each step, or commit locally only?
31. Keep the default tech stack (Section 2), or change anything?

**J. Document-Specific Questions**
32. Every gap, ambiguity, or contradiction found in the description — quote the relevant section and propose an interpretation.

---

## 4. Project Structure

```
app/
  (shell)/          # Every page that uses the Sidebar/Topbar — including ALL module folders
    dashboard/
    <module>/
  login/            # Outside (shell)
  api/              # Route Handlers for the mock API
mock-data/          # JSON files — single source of truth for mock data
components/         # Shared components only
  ui/               # shadcn
  shell/            # Sidebar, Topbar, Breadcrumbs, RoleSwitcher
lib/                # mock-api.ts, i18n/labels.ts, navigation.ts, types, permissions
docs/               # project-brief, roadmap, spec-*.md, prompts-*.md
  source/           # Original system description(s) from the user
```

> **Important:** Module folders must live **inside** `app/(shell)/`, not beside it. A `layout.tsx` inside a route group only wraps routes within that group.

If Discovery established multiple interfaces, use one route group per interface (e.g., `(admin)/`, `(field)/`, `(public)/`), each with its own layout.

---

## 5. Mandatory Rules (copy verbatim into `CLAUDE.md`)

1. **Component reuse.** Every module uses the shared components in `components/`. If a variation is needed, extend the shared component with props — never duplicate it. No generic UI components inside `app/<module>/`.
2. **Mock data through the API only.** JSON lives in `mock-data/` and is read exclusively through `app/api/` (or the agreed client-side store). Pages fetch data; they never import JSON directly or hard-code arrays in components.
3. **Five-screen pattern per module:** List → Detail → Create/Edit → Activity log / Audit trail → Module KPIs.
4. **Theme and direction safety.** Use semantic color tokens only (`bg-card`, `text-muted-foreground`, ...) — no raw hex values in components. Use logical properties (`ps-`, `pe-`, `start-`, `end-`, `text-start`) instead of `pl-`, `pr-`, `left-`, `right-`.
5. **WORKLOG.md.** Read it from the top before any work. After every task, append an entry at the bottom. Append-only — never edit or delete past entries.
6. **Realistic, connected data.** Real-looking names, organizations, dates, reference numbers, and amounts appropriate to the agreed locale — never `Test1`/`Test2` or lorem ipsum. Entities reference each other by ID (`employeeId`, `caseId`, ...).
7. **Small commits.** One commit per screen or feature, using Conventional Commits: `feat(<module>): ...`, `fix: ...`, `chore: ...`, `docs: ...`.
8. **No invented requirements.** If the spec is silent or contradictory, log it and ask.

---

## 6. Known Technical Pitfalls

- **Base UI `render` / `asChild`:** Do not pass the shared `Button` component into `render`/`asChild` of Base UI primitives (`DropdownMenuTrigger`, `Link`, ...) — it triggers an "expected a native button" warning. Use a raw `<button>` or `<Link>` with `buttonVariants(...)` as the `className`.
- **Dark logos:** A logo with dark text must sit inside a fixed `bg-white` card so it stays legible in dark mode.
- **`next-themes`:** Set `enableSystem={false}`, an explicit `defaultTheme`, and `suppressHydrationWarning` on `<html>`.
- **Initial direction:** Set the default `lang` and `dir` on `<html>` server-side to avoid a flash of wrong direction.
- **Per-language fonts:** Switch fonts via the `--font-sans` variable with a `[dir="ltr"]` / `[dir="rtl"]` override.
- **Cache issues:** Optionally make the `dev` script clear `.next` before starting.
- **Serverless state:** Route Handler module state does not persist reliably on Vercel/serverless. See Discovery question 29.

---

## 7. Phase 2 — Planning (you write it, the user reviews it)

1. Write `docs/roadmap.md`: modules, architectural decisions, folder structure, **build order by dependency** (foundational and most demo-visible modules first; modules that depend on them next; cross-cutting modules such as Workflow, Access Control, and Analytics last), and a rough time estimate.
2. For each module, write `docs/spec-<module>.md`, **derived strictly from that module's section of the description** (nothing invented). Fixed sections:
   1. Module scope and relationships to other modules
   2. Data model (field tables)
   3. Status lifecycle (state machine)
   4. Business rules — as a table that can be implemented as validations
   5. Permissions (role × action)
   6. Module dashboard KPIs
   7. Integrations (placeholders)
   8. **Complete screen list** (the implementation reference)
   9. **Build order** of prompts
3. For each module, write `docs/prompts-<module>.md`: numbered prompts (`N.1`, `N.2`, ...) using the template in Section 11, each referencing specific spec section numbers.
4. **STOP.** Present the module list, build order, and a summary of each spec. Do not continue until the user approves.

---

## 8. Phase 3 — Shared Foundation (before any module)

Build in this order. **Each step = one commit + one WORKLOG entry.**

| # | Step | Details |
|---|---|---|
| 0.1 | Project setup | Stack from the Project Brief, folder structure, `CLAUDE.md` (Section 5) |
| 0.2 | `WORKLOG.md` | Fixed rules header + first entry |
| 0.3 | Design tokens | Brand colors as semantic variables, `bg-brand-gradient`, favicon |
| 0.4 | Theming | Light/dark with a coherent dark palette (toggle added in 0.6) |
| 0.5 | Localization | `LocaleProvider` + `lib/i18n/labels.ts` (modules, common UI, roles) + fonts — skip toggle if single-language |
| 0.6 | App shell | Sidebar (all modules, active link highlighted), Topbar (search, notifications, theme, language, role), Breadcrumbs, `ComingSoon` page |
| 0.7 | Mock auth | `/login` + `RoleProvider` + `RoleSwitcher` (no route guarding unless requested) |
| 0.8 | **Component library** | See full list below |
| 0.9 | Mock infrastructure | `lib/mock-api.ts` (simulated 300–600 ms latency) + `/api/health` |

**Component library (0.8) — build it completely up front.** Retrofitting shared components later means touching dozens of pages.

- `DataTable`, `StatusBadge`, `KPICard`, `Modal`, `Timeline`, `FormField`, `EmptyState`, `ErrorState`, `LoadingSkeleton`
- `FilterSelect` — the unified filter dropdown used on every list
- `SearchableSelect` / `Combobox` — searchable dropdowns, plus entity pickers (e.g., `EmployeeSelect`)
- `ChipListEditor` — tag / multi-item editor
- Attachment components (mock upload and preview)
- Generic share/assign/refer modal (if the system has routing or referrals)
- `ModuleScreensGrid` — card grid of a module's screens on its landing page

> **Checkpoint after 0.9:** Ask the user to verify in the browser — login, logo in both themes, direction switch, all modules in the Sidebar, role switching. Do not continue until they confirm.

---

## 9. Phase 4 — Modules (identical sequence for every module)

| # | Step | Commit |
|---|---|---|
| 1 | Empty routes + Sidebar links | `feat(m): scaffold empty routes` |
| 2 | Mock data + API (realistic, connected JSON + Route Handlers with simulated latency) | `feat(m): add mock data and API routes` |
| 3 | List screen: tabs + filters + search + `DataTable` | `feat(m): <x> list screen` |
| 4 | Detail screen: fields + Timeline + Audit trail + comments + links to related entities | `feat(m): <x> detail screen` |
| 5 | State machine + business rules (actions depend on status; every action appends an audit entry) | `feat(m): status state machine and business rules` |
| 6 | Create/Edit form + modals (with validation from the business-rules table) | `feat(m): create form and modals` |
| 7 | Module-specific screens (kanban, version comparison, maps, ...) | `feat(m): ...` |
| 8 | Permissions screen (role × permission matrix, cosmetic toggles) | `feat(m): module permissions screen` |
| 9 | Wire the module KPI dashboard (computed from mock data) | `feat(m): wire module KPI dashboard` |
| 10 | **Full flow test** in the browser, performed by you | — |

**End-of-module gate:** Run a full flow (create → act → status change → audit trail → switch theme/language). Then give the user a short checklist of steps to try themselves, and **stop and wait for approval** before starting the next module.

---

## 10. Phase 5 — Polish and Cross-Module Integration

1. Global search across modules (Topbar).
2. Unified notifications.
3. Executive dashboard (`/dashboard`) with KPIs from every module.
4. **Final realism review:** logical, connected data; no empty or broken screens; zero console errors; full walkthrough in every theme and language.
5. If deployment was agreed in Discovery: deploy and share the URL.

---

## 11. Verification (for every visible change)

Never rely on "the code looks right." After every screen:

1. Start the dev server (`preview_start`) and open the page.
2. Check the console and network tabs — zero errors and zero warnings.
3. Exercise the interactions (filters, buttons, modals, forms) and confirm the results.
4. Switch theme and language; confirm direction and legibility.
5. `npm run build` must pass before committing.
6. Record in `WORKLOG.md` exactly what you verified.

---

## 12. Prompt Template (for `prompts-*.md` files)

```
Read WORKLOG.md first, then read sections X and Y of docs/spec-<module>.md.

Build: <a specific screen or feature with clear details — fields, filters,
       columns, buttons; name the shared components to use and the API route>

Not yet: <what is deferred to the next prompt>.

Commit with the message "feat(<module>): <description>" and append an entry
to WORKLOG.md summarizing this step.
```

---

## 13. WORKLOG Entry Format

Each entry contains:

- **Date**
- **Module / screen**
- **Completed** (precisely)
- **Key design decisions** — especially any that deviate from or extend the spec, with the reason
- **Issues / deferred items**
- **Actual verification performed**
- **Next step**

---

## 14. Start Now

1. Read the system description completely.
2. Present the **Understanding Summary**.
3. Run **Discovery** (Section 3) — ask all questions in batches, stating defaults.
4. Write `docs/project-brief.md` and get the user's confirmation.
5. Run **Planning** (Section 7) and stop for approval.
6. After approval: Foundation (Section 8), then module by module in the approved order, stopping at every checkpoint.
