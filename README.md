# CRM – VRA Real Estate

Multi-organization real estate CRM built with Next.js 16, React 19, TypeScript, PostgreSQL, Drizzle ORM, Better Auth and Tailwind CSS.

## Requirements

- Node.js 22
- PostgreSQL 16+ with permission to create the `pgcrypto` and `citext` extensions
- npm

## Environment variables

Set these in `.env` for local development, and in the Portainer stack for production. Never commit them.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql://USER:PASSWORD@HOST:5432/DBNAME` |
| `BETTER_AUTH_SECRET` | yes | Random, at least 32 characters (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | yes | The public URL, e.g. `https://crm.example.com` |
| `NEXT_PUBLIC_APP_URL` | yes | Same as `BETTER_AUTH_URL` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | no | Extra allowed origins, comma-separated |
| `SMTP_*` or `RESEND_*` | no | Email delivery for password resets |

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Unit tests |
| `npm run build` | Production build |

## Database: existing data (adding fields or tables)

Use this whenever the schema changes. It keeps all existing data.

**1. Make the change (on your PC):**

```bash
# edit src/db/schema/*.ts, then:
npm run db:generate        # writes the next numbered migration in src/db/migrations
```

- Open the generated `.sql` file and check it only contains your change. Migrations `0008` and `0009` were written by hand without a Drizzle snapshot, so `db:generate` may try to add their indexes or columns again; delete those lines if it does.
- Never edit a migration that has already run: the runner stores a checksum and refuses to start if a file changed. Add a new migration instead.

**2. Apply it locally and check:**

```bash
npm run db:migrate         # applies new migrations only
npm run db:sync-permissions # adds new permissions and refreshes their descriptions
npm run db:check-schema    # read-only: fails if a table or column the code uses is missing
```

**3. Deploy:** run the new migrations against the production database yourself, then commit, push and redeploy the Portainer stack with rebuild. The stack does not migrate the database.

**Database commands on the server** (from the repo folder, with `DATABASE_URL` exported):

```bash
docker build --target migrator -t vraland-crm-migrate .          # rebuild after each pull
docker run --rm --network app-net -e DATABASE_URL vraland-crm-migrate                                       # apply new migrations
docker run --rm --network app-net -e DATABASE_URL vraland-crm-migrate npm run db:check-schema   # verify the live schema
docker run --rm --network app-net -e DATABASE_URL vraland-crm-migrate npm run db:sync-permissions  # after adding a permission to the catalog
```

`db:sync-permissions` adds new permission keys from `src/lib/permissions/catalog.ts` and grants them to the system roles once. It never removes a grant an administrator changed.

## Database: fresh (empty) database

This creates a new database from scratch. **Back up first.** It does not delete an existing database; create a new empty one and switch `DATABASE_URL` to it.

### Production

```bash
# 1. Back up the current database
pg_dump -Fc -h DB_HOST -U DB_USER -d DB_NAME -f crm-backup-$(date +%F).dump

# 2. Create the new empty database (in psql as an admin user)
CREATE DATABASE new_db_name OWNER db_user;
```

3. In Portainer, set the stack's `DATABASE_URL` to the new database. Don't redeploy yet.

From the repo folder on the server, after building `vraland-crm-migrate` as above:

```bash
# 4. Create all tables by running every migration in order
docker run --rm --network app-net -e DATABASE_URL vraland-crm-migrate npm run db:baseline

# 5. Organization, roles, permissions and pipeline stages
docker run --rm --network app-net -e DATABASE_URL vraland-crm-migrate npm run db:seed:reference

# 6. First administrator: enter the values without saving them in shell history
read -r ADMIN_EMAIL; read -rs ADMIN_PASSWORD; read -r ADMIN_FIRST_NAME; read -r ADMIN_LAST_NAME
export ADMIN_EMAIL ADMIN_PASSWORD ADMIN_FIRST_NAME ADMIN_LAST_NAME
docker run --rm --network app-net -e DATABASE_URL -e ADMIN_EMAIL -e ADMIN_PASSWORD -e ADMIN_FIRST_NAME -e ADMIN_LAST_NAME vraland-crm-migrate npm run auth:provision-admin
unset ADMIN_EMAIL ADMIN_PASSWORD ADMIN_FIRST_NAME ADMIN_LAST_NAME
```

7. Redeploy the stack in Portainer. The app starts on the new database.

- The admin password must be 12 to 128 characters.
- `db:seed:reference` and `auth:provision-admin` use the organization code `CRM-PROD` by default. Set `ORGANIZATION_CODE` (and optionally `ORGANIZATION_NAME`) on both if you want another one.
- To go back, set `DATABASE_URL` to the old database and redeploy.

### Local (development only)

```bash
npm run db:reset           # drops the local schema; refuses any non-localhost database
npm run db:baseline
ALLOW_DEVELOPMENT_SEED=true DEV_SEED_PASSWORD=choose-a-password npm run db:seed
```

`db:seed` adds demo users for every role, plus sample contacts, deals and properties. It refuses to run in production. Use `db:seed:reference` and `auth:provision-admin` instead of `db:seed` for a local database with no demo data.

The development seed targets `CRM-DEV` by default. Users are visible only within their organization. To target another development organization, set `ORGANIZATION_CODE` to its existing code. This seeds all demo data, not just executives. Each of `sales-executive`, `sales-executive-ih`, and `sales-executive-ind` gets three accounts: `<role>@dev.example.com`, `<role>-2@dev.example.com`, and `<role>-3@dev.example.com`. Rerunning updates those accounts, including their passwords.

In PowerShell, use separate environment assignments (the inline syntax above is for Bash):

```powershell
$env:ALLOW_DEVELOPMENT_SEED = 'true'
$env:DEV_SEED_PASSWORD = 'choose-a-password'
$env:ORGANIZATION_CODE = 'CRM-DEV' # Replace with your development organization code.
npm.cmd run db:seed
```

To add only executive test accounts to an existing organization, use the same environment variables and run `npm.cmd run db:seed:executives`. It creates three accounts for each executive role with organization-specific emails, such as `sales-executive-1.crm-prod@dev.example.com`. It preserves existing team assignments and refuses to run in production. Rerunning resets these test accounts' passwords to `DEV_SEED_PASSWORD`.

## Deployment (Docker / Portainer)

The stack (`docker-compose.yml`) runs one service, **app** (`vraland-crm`): the CRM, published on host port `3004` (container port `3000`; set `APP_PORT=3004`). Database migrations are run by hand (see above).

To deploy on the server, run `./deploy.sh` from the repo folder (or `./deploy.sh v0.4.0` for a tag). It pulls the code, rebuilds, restarts the app and waits for the health check. It stops if files were edited on the server. Variables come from a `.env` file in that folder. Run migrations yourself before deploying.

Uploaded documents and images are stored in the `documents` volume (`/app/.data`). Back it up together with the database:

```bash
docker run --rm -v vraland-crm_documents:/data -v "$PWD":/backup alpine \
  tar czf /backup/crm-documents-$(date +%F).tgz -C /data .
```

Network setup:

- Nginx Proxy Manager on a separate server terminates HTTPS and forwards to this host's port `3004` over the private network.
- A `DOCKER-USER` iptables rule on this host lets only the proxy's IP open port `3004`. Docker bypasses `ufw`, so `ufw` rules don't protect this port.
- The app reads the visitor IP from the proxy's `X-Real-IP` header, which is only safe while that firewall rule is in place.

## Testing

`npm test` runs the unit tests (Vitest). They need no database.

### Browser tests (Playwright)

Playwright builds and starts the app on port 3100, with a local email sink on 3101/3102, and runs against a real PostgreSQL database. Each test creates its own throwaway organization and users and removes them afterwards. It never migrates, resets or seeds the database.

**1. Create a test database.** Its name must end in `_test`: the run refuses any other database, so it can't touch development or production data.

```sql
CREATE DATABASE vra_test;
```

**2. Point the tests at it.** Create `.env.test` in the project root (git-ignored, never commit it) with one line:

```
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/vra_test
```

Only commands run with `NODE_ENV=test` read `.env.test`, so `npm run dev` keeps using your normal `.env`. (Putting the line in `.env.local` instead also works without `NODE_ENV=test`, but then `npm run dev` and every `db:*` script use the test database too.)

**3. Build its tables and permissions.** Run once, and again after pulling new migrations:

```bash
NODE_ENV=test npm run db:migrate
```

**4. Install the browser** (once): `npx playwright install chromium`

**5. Run the tests:**

```bash
NODE_ENV=test npm run test:playwright
```

In PowerShell, set the variable first: `$env:NODE_ENV = 'test'`, then run `npm.cmd run db:migrate` or `npm.cmd run test:playwright`, and clear it afterwards with `Remove-Item Env:NODE_ENV`. Use `npm.cmd`/`npx.cmd` if PowerShell blocks the script shims.

If the run stops with **"Refusing a database whose name does not end in _test"**, `DATABASE_URL` points at the wrong database. If it stops with **"Test database lacks required permission catalog"**, run step 3.

After the run, `npm run test:report` opens the local HTML report. Partial or filtered runs describe only their own results. Raw reports, traces, screenshots and fixture/auth files remain local and ignored.

- [Test strategy](docs/testing/TEST_STRATEGY.md) and [environment/commands](docs/testing/TEST_ENVIRONMENT.md)
- [API inventory](docs/testing/API_ENDPOINT_INVENTORY.md), [UI/control inventory](docs/testing/UI_FUNCTIONALITY_INVENTORY.md), and [role permission matrix](docs/testing/ROLE_PERMISSION_MATRIX.md)

## Architecture

- Code lives in `src`, grouped by feature (`src/features/*`) and infrastructure (`src/lib`, `src/db`). Routes are in `app/`.
- Better Auth owns the `auth_*` tables. Each auth identity links to one CRM `users` row through `auth_users.crm_user_id`. Public sign-up is disabled, and only active, non-deleted users of an active organization can sign in.
- Authorization is database-driven (`roles`, `permissions`, `user_roles`, `role_permissions`). Every query is scoped to the caller's organization and data scope (`dataScopeCondition`), and property inventory additionally follows access grants.
- Deleted users are soft-deleted (`users.deleted_at`) and can be restored from Settings → Deleted users.
