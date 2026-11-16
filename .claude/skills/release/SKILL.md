---
name: release
description: Cut a semver release - bump package.json, move the changelog's Unreleased entries under the new version, commit and create an annotated vX.Y.Z tag. Use when the user says "create a tag", "create tagging", "tag it", "release", "new version" or "bump the version".
---

# Release

The user may give a version or a level ("patch", "minor", "major"). Otherwise, work it out from the changelog.

1. **Check the state.**
   - Run `git status --short`, `git tag --sort=-v:refname | head -3`, and read the version in `package.json`.
   - If there are uncommitted changes, stop and ask whether to commit them first, with their changelog lines, or leave them out of the release.
   - If `## [Unreleased]` in `CHANGELOG.md` is empty, stop and say there is nothing to release.
2. **Choose the version.** Apply the semver table in `.claude/rules/git-release.md` to the Unreleased entries. The base is the latest `vX.Y.Z` tag, or the `package.json` version if there is no tag.
   - If the base version itself has never been tagged, ask whether to tag it as is or to bump it.
   - Tell the user in one line which version you chose and why, e.g. "v0.2.0: new features, nothing breaking".
3. **Update the files.**
   - Set `"version"` in `package.json`, and in the root entries of `package-lock.json` if it exists. Run `npm version <x.y.z> --no-git-tag-version` to do both.
   - In `CHANGELOG.md`, rename `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD` (today's date). Then add a new empty `## [Unreleased]` above it.
4. **Verify.** Run `npx tsc --noEmit --incremental false` and `npx vitest run`. If either fails, stop and report. Don't tag a broken build.
5. **Commit and tag.**
   - Commit with `git add package.json package-lock.json CHANGELOG.md` and `git commit -m "Release vX.Y.Z"`, with no co-author trailer.
   - Tag with `git tag -a vX.Y.Z -m "vX.Y.Z"`, using that version's changelog section as the tag message body.
6. **Report.** Give the version, the commit hash and the tag name. Say that nothing was pushed, and that pushing is `git push && git push origin vX.Y.Z` if they want it.
