# Agent documentation

Start with the guide for the task; these documents describe current implementation, not a roadmap or a guarantee of production configuration.

| Task | Read |
| --- | --- |
| Understand users, features, and terminology | [Product](product.md) |
| Find entry points and follow technical flows | [Architecture](architecture.md) |
| Change visibility, ownership, permissions, or downloads | [Access control](access-control.md) |
| Change contact intake, sales progression, or related records | [Sales workflows](sales-workflows.md) |
| Change persisted data or reference permissions | [Database changes](database-changes.md) |
| Implement and validate a task | [Development](development.md) |
| Configure, seed, migrate, or deploy the app | [Root README](../README.md) |

## Authority and maintenance

- [AGENTS.md](../AGENTS.md) remains authoritative for repository agent instructions; [CLAUDE.md](../CLAUDE.md) points to it. Consult installed Next.js documentation as required there.
- Source code establishes implemented behavior. These guides explain it and link to the owning modules. If prose and code disagree, inspect callers and report the discrepancy rather than silently treating either as intended product policy.
- The root README owns operational setup and deployment procedures. These guides link to it instead of copying those procedures.
- Each guide ends with an update trigger. Update the owning guide in the same change as the behavior it describes; cross-link instead of duplicating rules.
- Discuss the purpose, placement, scope, overlap, and recommendation for any additional Markdown file before creating it. Once a scope is agreed, implement it without repeating the approval request.

Source review and command observations date to **2026-11-04**. Known limitations are placed beside the relevant guidance. No browser walkthrough, production inspection, or live database validation was performed for this documentation.

**Update when:** documents are added, renamed, or change responsibility, or the authoritative instruction/setup locations change.
