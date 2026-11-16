# Commits, changelog and versions (always apply)

## Every commit updates CHANGELOG.md

- Add one line per user-visible change under `## [Unreleased]` in `CHANGELOG.md`, in the same commit as the change.
- Use the Keep a Changelog sections, in this order: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`. Create a section only when it has entries.
- Write for the people using the CRM, not about the code: "Payments can be exported to CSV", not "add payments route".
- Pure refactors, tests or tooling with no visible effect may go under `Changed` as one short line, or be skipped. If you skip it, say so when you report the commit.
- A pre-commit hook (`.claude/hooks/require-changelog.mjs`) blocks `git commit` when `CHANGELOG.md` isn't part of the commit. Don't bypass it with `--no-verify` or by editing the hook. Add the entry instead.

## Versions follow semver (MAJOR.MINOR.PATCH)

| Unreleased contains | Bump |
|---|---|
| A breaking change: removed feature, changed URL or API, a migration that drops or renames data | MAJOR (while below 1.0.0, MINOR instead) |
| `Added`, or a new permission or setting | MINOR |
| Only `Fixed`, `Changed` (small), `Security` | PATCH |

- The version lives in `package.json`. Tags are `vX.Y.Z` (annotated).
- When the user asks to "create a tag", "tag", "release" or "bump the version", use the `release` skill. Never tag or bump on your own.
- Never push commits or tags unless the user asks.
