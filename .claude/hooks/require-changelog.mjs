// PreToolUse hook: block `git commit` unless CHANGELOG.md is part of the commit.
import { execFileSync } from "node:child_process";

let input = "";
for await (const chunk of process.stdin) input += chunk;

const command = JSON.parse(input || "{}").tool_input?.command ?? "";
if (!/\bgit\b[^|;&]*\bcommit\b/.test(command) || /--dry-run/.test(command)) process.exit(0);

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
const staged = git("diff", "--cached", "--name-only");
// `commit -a` also takes tracked, unstaged edits; `git add ... && git commit` stages in the same command.
const all = /\s-(a\w*|-all)\b/.test(command) ? git("diff", "--name-only") : "";
const addsChangelog = /git add[^|;&]*(CHANGELOG\.md|\s\.(\s|$)|\s-A\b|--all)/.test(command);

if (/^CHANGELOG\.md$/m.test(staged + all) || addsChangelog) process.exit(0);

console.error(
  "CHANGELOG.md is not in this commit. Add a line under ## [Unreleased] (see .claude/rules/git-release.md), stage it, then commit.",
);
process.exit(2);
