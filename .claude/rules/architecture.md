# Architecture rules (always apply)

Follow these on every change. When code you touch breaks a rule, fix it in that change only if it is small; otherwise mention it.

## Where code lives

```
app/(crm)/<area>/page.tsx      thin page: permission check, parse searchParams, call queries, render components
app/api/<area>/.../route.ts    file downloads and CSV exports only (mutations go through server actions)
src/features/<feature>/
  actions/<name>.actions.ts    "use server" mutations
  queries/<name>.queries.ts    import "server-only"; reads, always scoped
  schemas/<name>.schema.ts     zod schemas shared by the form and the action
  components/<name>.tsx        UI for this feature
  lib/<name>.ts                pure helpers (no db, no React) and constants
src/components/ui|common|layout  shared UI kit; reuse before building new
src/lib/                       cross-feature infrastructure (permissions, http, audit, logger, utils)
src/db/schema/                 Drizzle tables; migrations are re-runnable
```

- Files are kebab-case. Keep the suffixes `.actions.ts`, `.queries.ts`, `.schema.ts` and `.test.ts`.
- A new feature gets the same folders. Don't create a parallel structure such as `services/`, `hooks/` or `utils/` inside a feature.
- Tests sit next to the code (`x.ts` and `x.test.ts`, run by Vitest). Browser flows go in `tests/e2e`, `tests/ui` and `tests/api`.

## Import direction (ESLint enforces the first two)

1. Components never import `@/db`, `drizzle-orm`, `queries/*` or the logger. Type-only imports are fine. Data arrives through props from the page, or through server actions. The one exception is `*-page-content.tsx` server components.
2. `lib/` and `queries/` never import components. A shared constant goes in `lib/`, not in a component file.
3. Values that both a server page and a `"use client"` file use go in a non-client file such as `lib/` or `*-types.ts`. Importing a value from a client file into a server file turns it into a client reference.
4. Cross-feature imports go to the other feature's `lib/`, `schemas/` or `queries/`. Never import another feature's internals just to reuse a private helper. If two features need it, move it to `src/lib`.
5. Never import from `app/` into `src/`.

## Reuse before writing

| Need | Use |
|---|---|
| Permission check | `requirePermission`, `requirePagePermission`, `getAuthorizationContext` + `hasPermission` (`@/lib/permissions/*`) |
| Row visibility | `dataScopeCondition`, `scopedAgentCondition`, `grantedPropertyCondition`, `canAccessResource` |
| Action return value | `ActionResult`, `success`, `failureFrom`, `validationFailureFromZod`, `databaseFailure` (`@/lib/types/action-result`) |
| Errors and logging | `logError` (`@/lib/logger`), never `console.*` in app code |
| CSV export | `csvResponse` (`@/lib/http/csv`) |
| File download route | `@/lib/http/file-route` |
| Dates and times | `@/lib/utils/manila-time` (the business runs on Manila time) |
| Class names | `cn` (`@/lib/utils/cn`) |
| Forms | `@/components/ui/form-kit` (`FormSection`, `FormField`, `formActionsClass`) |
| Tables, menus, empty states | `@/components/ui/table`, `row-actions-menu`, `empty-state`, `paginator` |
| Page frame | `PageContainer`, `PageHeader` (`@/components/common`) |
| User photo | `InitialsAvatar` + `avatarSrc` |

If what you need is missing, add it once in the shared place. Don't write a local copy. There are already four local `money()` helpers, so don't add a fifth.

## Keep files small

- Write a new file when the topic is different, not when the file gets long. Even so, a new file over ~400 lines is a sign to split it.
- These files are already too big, so add new code beside them, not inside them: `settings.actions.ts`, `contact.actions.ts`, `deal.actions.ts`, `contact-form.tsx`, `marketing.actions.ts`, `pipeline-board.tsx`.
- One component per concern. Put a large dialog or section in its own file.
- No abstraction, option or wrapper that only one caller uses.

## Done means

`npx tsc --noEmit --incremental false`, `npx eslint <changed files>` and `npx vitest run` all pass. New logic that branches, loops, handles money or checks permissions gets a small test.
