---
paths:
  - "src/features/*/actions/**"
  - "src/features/*/queries/**"
  - "src/features/*/lib/**"
  - "app/api/**"
  - "src/lib/**"
  - "src/db/**"
---

# Server code rules

## Server actions (`*.actions.ts`)

Every action follows this order:

1. `"use server"` at the top of the file.
2. `const context = await requirePermission("<area>.<verb>")`. This is the first line of the action, with no exceptions.
3. Parse the input with the feature's zod schema. On failure, `return validationFailureFromZod(...)`.
4. Check every foreign key from the client against `context.organizationId` and the data scope (`canAccessResource` or an organization filter). Never trust an ID you were sent.
5. Write inside `db.transaction`. Lock a row (`for update`) before any check-then-write on money, stage or status.
6. Write an `auditLogs` row for every change a user makes, using `buildChangeSet` and skipping empty change sets.
7. `revalidatePath` for the affected pages.
8. `return success(...)`, or `failureFrom(code, message)`. Catch database errors, `logError(...)` them, then `return databaseFailure("<plain message>")`. Don't throw to the client.

- Messages to users are short and plain, and use the terms in `ui.md`.
- Derived values such as commissions and totals are computed in one place and are never written from form input.

## Queries (`*.queries.ts`)

- `import "server-only"` at the top.
- Call `requirePermission`, then filter with `organizationId` plus the scope helpers (`dataScopeCondition`, `grantedPropertyCondition`, `leadNotArchived`, ...).
- Every list query is paginated or has an explicit `limit`. Nothing loads a whole table.
- Select only the columns that are shown. Avoid a correlated subquery per row; join or aggregate once.
- Sort keys come from an allow-list (the `isXSortKey` pattern), never straight from the URL.

## API routes (`app/api/**/route.ts`)

- Only for downloads, previews and exports.
- Check `getAuthorizationContext()`, returning 401 if missing, then `hasPermission`, returning 403 if denied.
- Reuse the page's scoped query. Never write a second, unscoped query for an export.
- CSV goes through `csvResponse`, which guards against spreadsheet formulas. Files go through `file-route`.

## Database (`src/db`)

- Schema changes need a migration that can be re-run (`if not exists`). The user runs `db:migrate`, not Claude.
- Add an index for every new foreign key or column you filter or sort on.
- Never read `.env`, and never run scripts that load it (db:*, playwright, next build/dev).

## Background jobs

They run from `instrumentation.ts`. Claim rows atomically (`for update skip locked`), keep each run bounded, and log failures with `logError`.
