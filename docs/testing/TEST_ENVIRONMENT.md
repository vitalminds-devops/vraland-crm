# Test environment

A git-ignored `.env.test` (with `NODE_ENV=test`) or `.env.local` supplies `DATABASE_URL`; the database name must end in `_test` (see the README's Testing section). Never print or commit credentials. [Environment preflight](../../tests/helpers/environment.ts) loads Next environment settings, accepts only a `DATABASE_URL` whose database name ends in `_test`, verifies the connected database has that name and a users table, and checks all 63 permission keys already exist. It fails rather than provisioning missing catalog data. The identity fixture additionally validates its actual connected mutation/cleanup client before use.

[Server launcher](../../tests/setup/server.ts) first verifies the database and copies local OCR assets, then runs `next build` followed by `next start` with NODE_ENV=production at **http://127.0.0.1:3100**. PLAYWRIGHT_TEST_SERVER=1 isolates build output in `.next-test`; [Next configuration](../../next.config.ts) omits standalone output for this test build while preserving standalone output normally. Production mode avoids development HMR reloads interrupting browser workflows. Playwright allows 360 seconds for build/start readiness. It starts a loopback SMTP sink on **3102** and HTTP mailbox on **3101**. Mailbox GET `/messages?to=<recipient@example.invalid>` only accepts synthetic recipients in that domain. Test-only auth/SMTP settings are supplied to build and runtime; Resend key/from values are blanked, so no real marketing email is sent through that provider. Reset emails go to the local sink. Do not start overlapping Playwright-managed servers on these ports; reuseExistingServer is false.

Production mode retains the application's real Secure cookie policy, production CSP and configured trusted origin. The loopback HTTP target is intentional: installed Playwright cookie handling permits Secure cookies for local hostnames, including 127.0.0.1, and Chromium treats loopback specially. This exercises production cookie settings locally; it does not verify deployed TLS/proxy configuration. Better Auth production rate limiting also applies (including shared buckets if no trusted client IP is supplied); distinguish any 429 setup failure from the business assertion under test.

[Identity fixture](../../tests/fixtures/identity.ts) inserts a UUID organization with `pw-<UUID>` code, CRM/auth user, requested catalog-default role/permissions, and a hashed credential account. A manifest is written under ignored `tests/.auth/manifests`. Each test receives fresh credentials and organization ownership. Scenarios seed organization-local stages/business records as needed; this scoped fixture seeding is distinct from a global development/reference seed.

Cleanup checks organization ID plus its exact generated code. Application-upload storage cleanup accepts only keys under that newly created organization's `<UUID>/` prefix and checks the resolved path remains under `.data/documents`; [file fixtures](../../tests/helpers/file-fixtures.ts) remove only their exact successfully created `pw-files-UUID.bin` keys. Restricting payment/bill/deal/contact rows are deleted within the owned organization before cascade deletion. The identity database connection closes in a finally block. Existing organizations and unrelated storage keys are outside cleanup scope. Forced process termination can leave a manifest/test organization requiring guarded review; do not replace scoped cleanup with a database reset.

No migration, schema push, reset, global seed, production fixture reuse or real external delivery is authorized by these commands. The existing schema/catalog must be provisioned separately. Realistic user roles and business data are isolated per test. SMS/social/e-sign success is unavailable in current application provider implementations.

Main c3aaaad additionally requires `contacts.expired_at` (migration 0025); read-only inspection found it absent as well as `bill_items`. Positive contact workflows have an explicit schema precondition; malformed CSV and locked-form checks can still run. Provision these schema changes separately before treating affected workflows as executable integration coverage.

Main also adds automatic global lead expiry at startup/hourly. `instrumentation.ts` suppresses only that worker when `PLAYWRIGHT_TEST_SERVER=1`, which the launcher sets for both build and runtime. Two Vitest tests verify the suppression and normal startup path. Expiry business logic is integration-blocked on this shared database: running it would mutate records outside fixture organizations. A fully isolated database is needed for its 30-day/payment/archive/concurrency scenarios. Normal application startup retains the worker; testing does not change the expiry rules.

After updating to main eb91ddf, read-only inspection found `public.bill_items` absent from this database. Billing integration now checks that schema prerequisite explicitly and fails with an environment-blocker message. The upstream migration `src/db/migrations/0023_add_bill_items.sql` creates the table and backfills existing bills; it was not applied by the testing suite. Have the approved test schema provisioned through the project's reviewed migration process, then rerun `npx playwright test tests/e2e/properties-billing.spec.ts --project=e2e`. Do not use a reset to resolve this gap.

Install dependencies/browser if absent with `npm ci` and `npx playwright install chromium`. On this Windows PowerShell environment use `npm.cmd`/`npx.cmd` when execution policy blocks the `.ps1` shims.

| Command | Purpose |
|---|---|
| `npm run test:api` | API project |
| `npm run test:ui` | Desktop UI project |
| `npm run test:e2e` | Browser business workflows |
| `npm run test:mobile` | iPhone-emulated auth/task/profile workflows |
| `npm run test:playwright` | Full configured suite, managed local servers |
| `npx playwright test --list` | Discover scenarios without starting the application |
| `npm run test:report` | Open local HTML report |
| `npm run typecheck` | TypeScript verification |
| `npm test` | Existing Vitest suite |

Run one feature with `npx playwright test tests/e2e/contacts.spec.ts --project=e2e`; filter a scenario with `--grep "contact"`. Use `--debug` for the Playwright Inspector or `--headed` to watch Chromium. Inspect a failure with `npx playwright show-trace <path-to-trace.zip>` using the exact path from the terminal/HTML report. Filtered runs replace the latest JSON and artifacts; archive the full-run evidence before debugging and do not present a filtered report as the full suite.

Reports: ignored `playwright-report/` and `test-results/`; JSON at `test-results/results.json`. Storage is in ignored `.data/documents`; fixture manifests/auth state under ignored `tests/.auth`. Raw reports, screenshots, traces and SMTP contents may contain sensitive request data and must remain local. No browser storage state or credentials are committed.
