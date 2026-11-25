# Agent development workflow

## Before changing code

1. Read [AGENTS.md](../AGENTS.md) and any applicable nested instructions. Read the relevant installed Next.js guide under `node_modules/next/dist/docs/`; this repository uses 16.4.2 and should not be changed from remembered framework conventions alone.
2. Use [product](product.md) and [architecture](architecture.md) to identify the feature, then trace page → component → action/query → helpers/schema. Check callers before interpreting a helper's name as policy.
3. Inspect working-tree changes and preserve unrelated work. Define the requested behavior and affected access/side effects before editing.
4. For persistence/access/sales work, read the corresponding [database](database-changes.md), [access](access-control.md), or [workflow](sales-workflows.md) guide.

The [root README](../README.md) owns setup, environment and deployment instructions. It specifies Node 22, npm, and PostgreSQL 16+ with `pgcrypto`/`citext` support. Keep the tracked npm lockfile; the Docker build uses `npm ci`.

## Implementation conventions

- Page action groups use a three-dot menu when more than one permitted action is available. If only one action is available, show its labeled button directly; if none are available, show neither. Count actions after permission checks, preserve their destinations and behavior, and give icon-only triggers an accessible name. Explicit page designs can override this default. The Properties list keeps Export, Archive, and Add property as separate labeled buttons, wrapping on smaller screens.

- Keep route composition under `app/`, feature behavior under `src/features/`, reusable infrastructure under `src/lib/`, and shared UI under `src/components/`. `@/*` maps to `src/*`.
- Server pages/queries read data; interactive client components handle browser state. Keep server-only imports out of client bundles. Use installed Next.js guidance for Server Actions, async route parameters, caching and revalidation.
- Validate action inputs using the feature's Zod schema and enforce server permissions plus related-record scope. Filtering a dropdown is not authorization.
- Preserve transactions that combine business writes with history/activity/audit. Audit payloads need deliberate field selection; consult [redaction helpers](../src/lib/audit/redact.ts). Avoid logging uploaded documents or credentials.
- Most actions use [ActionResult](../src/lib/types/action-result.ts); [client result helpers](../src/lib/types/action-result.client.ts) translate results. Unit actions retain `{ success, message }` compatibility. Inspect actual callers before standardizing return shapes.
- Revalidate the views affected by mutations and preserve partial-success messages for multi-action forms. Do not assume every form submission is one transaction.
- Reuse shared form/table/dialog primitives and feature helpers. There is no repository-wide formatter configuration establishing that all existing formatting is uniform.
- Use [Manila time helpers](../src/lib/utils/manila-time.ts) for the behavior already relying on them; distinguish date-only values from timestamps. Organization timezone fields do not mean every module implements arbitrary timezones.

## Local commands and generated files

The following scripts are declared in [package.json](../package.json):

| Command | Purpose | Verification status for this documentation |
| --- | --- | --- |
| `npm run dev` | Local Next server; predev copies OCR assets | Inspected, not started |
| `npm run typecheck` | `tsc --noEmit` | Executed via `npm.cmd`; passed |
| `npm test` | Vitest unit suite | Executed via `npm.cmd`; 7 files / 38 tests passed |
| `npm run lint` | ESLint, without fixing files | Executed via `npm.cmd`; failed, see below |
| `npm run build` | Production build; prebuild copies OCR assets | Inspected, not run |
| `npm start` | Serve production build | Inspected, not run |

Observations above were made during the **2026-11-04 repository scan**, before documentation creation, on Node **v26.13.0**, not the documented/Docker Node 22 target. They are a dated baseline, not proof that a future change passes. In this Windows PowerShell environment, `npm` selected a blocked `npm.ps1`; `npm.cmd` ran the same package scripts without changing execution policy. Use PowerShell environment-variable syntax when adapting the README's POSIX examples.

[OCR asset copying](../scripts/copy-ocr-assets.mjs) generates `public/ocr/` and `vendor/js-clipper.utf8.cjs`. Edit the script/configuration or upstream source as appropriate, not generated output. `next dev` may regenerate the instruction block described in `AGENTS.md`.

**Known lint baseline:** 23 errors and 65 warnings. One application error is `Date.now()` during render in [contact-row.tsx](../src/features/contacts/components/contact-row.tsx); the remaining errors are in the generated vendor copy, with warnings in generated OCR/vendor files. [ESLint configuration](../eslint.config.mjs) does not exclude those generated paths. Do not claim lint is clean or silently weaken checks to hide these findings. Recheck the baseline when addressing lint or generation.

Database and outbound email scripts were not run. See the [schema-check limitation](database-changes.md#known-schema-check-limitation) before relying on `db:check-schema`.

## Validation matrix

[Vitest config](../vitest.config.ts) runs `src/**/*.test.ts` in Node and aliases `server-only` to a test stub. Current tests cover ID/address parsing, CSV safety, Manila dates, file signatures, file-route helpers and schema-drift comparison. They do not establish browser behavior, live authorization, migrations or provider delivery. No browser/database integration suite or CI workflow was found during the scan.

| Change | Validation to select and report |
| --- | --- |
| Pure helper/parser | Relevant existing Vitest tests; meaningful regression cases for changed behavior |
| UI/form | Typecheck/lint for changed code; browser happy path, invalid input, error/loading state and relevant viewport behavior |
| Permission/query/file route | Allowed/denied role, other organization, own/team/organization scope, direct request, deleted/inactive identity, related-record and sensitive/inventory restrictions |
| Contact/deal workflow | Creation and approval distinctions, duplicate handling, partial save/upload failure, valid/invalid move, pending approval, rejection, stale request and lost reason persistence |
| Broker reassignment | Same broker, invalid target, won lock/override, mixed batch, histories, and confirm actual contact/deal ownership effects |
| Inventory/upload/OCR | Grant-limited selectors and direct endpoints, invalid file/signature, upload failure cleanup, OCR failure/manual entry, separate upload after parsing |
| Database | Typecheck plus disposable-database upgrade and fresh baseline checks; validate actual columns/constraints and preserved data, not just snapshot helper tests |
| Provider/automation | Missing configuration, provider failure and persisted results; manual execution semantics; external sending only when authorized for the task |
| Documentation only | Source claims, local links/anchors, diagram branches, command/script consistency and final diff scope |

Select checks proportional to the change. Run required checks, distinguish pre-existing failures from new ones, and state when browser/database/provider validation was unavailable. Do not describe manual scenarios as automated tests that already exist.

## Completion and maintenance

Summarize behavior changed, validation actually executed, existing failures, and unresolved limitations. Update the guide owning the changed behavior and its links; keep setup procedures in the root README. Discuss proposed `AGENTS.md` changes separately.

**Update when:** commands, toolchain, testing coverage, coding patterns, generated assets, environment assumptions, or baseline limitations change.
