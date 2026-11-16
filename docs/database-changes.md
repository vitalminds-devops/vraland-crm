# Database change checklist

Use the [root README](../README.md) for environment setup, fresh versus existing database procedures, migration execution and deployment. This guide explains what to inspect when changing persistence; it does not replace those procedures.

## Sources of persisted structure

| Source | Role |
| --- | --- |
| [Drizzle schema](../src/db/schema/index.ts) | Application table definitions and TypeScript query types |
| [Numbered SQL migrations](../src/db/migrations) | The only definition of the database: every install, new or existing, runs them in order |
| [Migration metadata](../src/db/migrations/meta) | Drizzle generation snapshots/journal; not the custom runner's complete migration history |
| [Reference seeds](../src/db/seeds/reference.ts) and [stage seed](../src/db/seeds/pipeline-stages.ts) | Organization defaults and reference data; inspect conflict/update semantics before rerunning |
| [Permission catalog](../src/lib/permissions/catalog.ts) | Recognized permissions/default role grants, synchronized by a separate script |

The [migration runner](../src/db/scripts/migrate.ts) sorts all `.sql` files, tracks them in `app_migrations`, and applies each pending file in a transaction. It checks recorded checksums where present. An existing schema with empty migration history is rejected rather than blindly replayed.

A new, empty database is built the same way: `db:baseline` is an alias of `db:migrate`, which first enables the `citext` extension and then runs every migration from `0000`. There is no separate fresh-install schema to keep in sync.

## Change workflow

1. Identify affected tables, queries/actions, organization scope, foreign keys, defaults, constraints and existing-data implications. Consult [access control](access-control.md) for ownership/access changes.
2. Update Drizzle definitions. Use the existing generation command only against an appropriate development setup; inspect generated SQL before applying anything.
3. Compare generated SQL with all later handwritten migrations. The journal/snapshots currently end at `0007`, while SQL files extend through `0018`. Generation may propose already-applied changes or stale structure; the README's warning mentioning `0008`/`0009` is not the full current inventory.
4. Add a new migration rather than rewriting historical ones. Review both existing-data upgrade and empty-database behavior.
5. For permission changes, update the catalog and inspect [sync-permissions.ts](../src/db/scripts/sync-permissions.ts). Ordinary system roles receive defaults for keys newly inserted that run; super-administrator is additively reconciled to all permission rows. Custom roles are untouched. Do not replace this with a reset of administrator-customized permissions.
6. Validate types and focused behavior. On an explicitly selected disposable/local database, verify upgrade and baseline paths, data preservation, constraints and affected queries. Report which path was actually exercised.

Do not substitute `db:push`, reset, or a demo seed for an incremental migration on an existing deployment. Development seeds and admin provisioning have explicit environment guards and purposes; inspect their scripts before use.

## Known schema-check limitation

**Verified by source/filesystem inspection on 2026-11-04; command not executed:** [check-schema.ts](../src/db/scripts/check-schema.ts) builds `meta/${latest.tag}_snapshot.json`. The latest tag is `0007_add_cover_image_columns`, but the actual file is `0007_snapshot.json`. With the current files and a valid environment, the script would fail reading the snapshot before connecting to PostgreSQL.

Even after correcting that lookup, the checker compares snapshot table/column presence, not all current Drizzle definitions, constraints, indexes, types, or later handwritten migrations. Do not report `db:check-schema` as a comprehensive schema validation or a known-working check until those limitations are addressed. Its unit test validates the comparison helper, not this file lookup or a live database.

## Environment and execution boundaries

Most custom scripts import [load-environment.ts](../src/config/load-environment.ts), which uses Next's environment loader. [drizzle.config.ts](../drizzle.config.ts) directly reads `process.env.DATABASE_URL`; ensure it is available to Drizzle commands rather than assuming every CLI has identical loading behavior.

Database, reset, seed, provisioning and deployment commands were inspected, not run for this documentation. Treat database target selection as a real prerequisite. The checked-in Compose topology provides migrator/app services, not a local database server.

**Update when:** migration tracking/generation, baseline conventions, schema checks, environment loading, permission synchronization or seed semantics change. Remove the dated limitation only after verifying the correction.
