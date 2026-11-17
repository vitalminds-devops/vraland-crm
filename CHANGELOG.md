# Changelog

All notable changes to this project are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `deploy.sh` deploys the latest code on the server in one command.

- "Delete developments" now works: an empty development can be deleted from its page.
- "Delete opportunities" now works: an opportunity entered by mistake can be deleted from its page, unless it is Won, has payments, holds units or parking, or is the contact's only opportunity.
- "Reassign agent" on an opportunity's page moves it to another agent, with a reason. On a Won opportunity the commission moves too.

### Changed
- A restored user comes back inactive; activate them to let them sign in.
- Deploying no longer runs database migrations; run them by hand before deploying.

- Tasks can only be assigned to active users within the assigner's data access.
- Marketing recipient and follow-up lists hide the name, email and mobile number of contacts outside the viewer's data access.
- "See everyone's property access" opens a property's Access page view-only, so Sales Managers can use it.
- Nobody except the Super Administrator can change a role they hold. It shows as "Your role", read-only.
- The contact form no longer changes an opportunity's agent; use "Reassign agent" on the opportunity.
- A scheduled campaign that can't send (a social campaign, or no email or SMS provider set up) goes back to draft instead of blocking newer campaigns. The reason is in the logs.
- Each permission's info button, on the Roles page and a user's Permissions, now explains what it allows and every condition that limits it. Permissions no feature uses yet say "Not used yet". The filter searches these details too.

### Removed
- Lead source is no longer asked for or shown: it's gone from the contact form, the opportunity page and the report filters, along with the "Conversion by lead source" table and its export.
- Commercial contacts no longer ask "Who is buying?", Owner name or Representative, and the contact page no longer shows Business details. Contact CSV import and export drop those columns.
- Migration 0052 deletes the stored lead sources and the commercial buyer fields from the database.

- The "Approve contacts" and "Manage settings" permissions. Neither ever did anything: contacts are approved automatically, and there are no organization settings to manage.

### Fixed
- When a user is deactivated or archived, only an active agent or broker can take over their work, and records they only broker can only go to someone who can be a broker.
- Handing over a user's work now also moves the opportunities they are a co-agent on, and every moved contact, opportunity, task and viewing appears in the audit log.
- A contact, opportunity, task or viewing can no longer be assigned to a user at the same moment they are deactivated or archived.
- A restored or reactivated user no longer reports to a broker who has since left; that link is cleared.
- Restoring an archived contact whose agent has left asks for a new agent, and its open opportunities move with it.
- Pipeline cards show the agent's initials instead of repeating the contact's.
- Pipeline cards in Won, Lost or Cancelled no longer show the close date as overdue; overdue now follows Manila time.
- A lead moved back from Opportunity can be moved to Opportunity again with the units and parking it still holds.
- When a contact can't be saved, the message now says why (email already used, a field too long, a missing field, the database needing migrations) instead of "Couldn't save contact".
- A Reservation payment below the reservation fee is refused instead of leaving the opportunity stuck; paying more is still allowed.

- Buttons for actions a user can't complete are hidden: Add contact, Edit, notes and Add details on contacts; Reassign broker without "Reassign a contact's broker"; Edit, Archive and unit controls on properties outside the user's reach. Only Super Administrators see the option to override the won-sale lock.

### Security
- Updated Next.js from 16.4.2 to 16.4.6 to fix a published security advisory.

## [0.3.0] - 2026-11-16

### Added

- New permission "Move opportunities back". Administrators can grant it to other roles in Settings.
- Administrators can add or remove permissions for one user, in a new Permissions section on the user's page. It lists every permission, ticked from the user's roles.
- `npm run db:report-unpaid-stages` lists opportunities in Reservation or Won whose payments don't cover the reservation fee or the first monthly amortization.

### Changed

- Recording a Reservation payment moves the opportunity from Opportunity to Reservation, a Monthly payment moves it from Reservation to Won, and a Full payment moves it straight to Won from Opportunity or Reservation. Moves that need approval are sent for approval as usual.
- Moving an opportunity back to an earlier stage, including reopening a won or cancelled one, needs "Move opportunities back". Administrators, Super Administrators and Master Brokers have it by default.
- Permissions alone now decide access, administrators included: "Manage users", "Manage roles and permissions", "View logs", "View billing", "Record reservation fee payments" and the data access permissions work for any role or user they are given to, and taking one away from an administrator takes it away.
- Billing follows "View billing" and the user's data access: brokers keep seeing their own opportunities' bills, and the Payments list and recording payments only reach opportunities in the user's data access.
- People who manage users can only change users who have no access they lack, and only give roles that have no access they lack.
- Data access is now three permissions under "Data access": "See own records", "See team records" and "See all records". Set them on the Roles page or for one user. Every role and user keeps the access they had.
- A user with none of the data access permissions sees only their own records.
- After a payment, the message says what happened to the opportunity: moved to which stage, sent for approval, or not moved yet because the fee isn't fully paid.
- The My team page needs "See team records" or "See all records" as well as leading a team.
- Existing roles get the narrower data access permissions their defaults include (a Broker shows "See own records" too). Nobody's access changes.

### Removed

- The Data access choice on the user page. Use the user's Permissions section instead.

### Fixed

- An opportunity with several units needs every unit's reservation fee before it moves to Reservation, and every unit's monthly amortization before it moves to Won. Billing shows these totals. A reservation fee entered on the opportunity itself still counts as the total.
- Dates can be picked in the calendar inside dialogs, such as scheduling a viewing, a task's due date and certificate dates. Menus and tooltips inside dialogs respond again too. On short screens the calendar scrolls so its time controls and Done button stay reachable.
- Date fields are named by their label alone ("Starts", "Due"), with the chosen date read as their description.
- Saving a user's access and permissions together is all or nothing: if one part fails, neither is saved.
- The permission groups on a user's page no longer overlap: they fit as many columns as the form has room for.
- Each Preview button on a user's documents names its file ("Preview supporting.txt"), so screen readers can tell them apart.
- A CSV import row with no agent or no preferred development is imported instead of being rejected.
- An opportunity can only move to Reservation once its Reservation payments cover the reservation fee. Any amount used to be enough.
- An opportunity can only move to Won once its Monthly payments cover the monthly amortization. Any amount used to be enough.
- A new database built with `db:baseline` now gets every migration. It used to load a schema file that stopped at migration 0009 and then mark all migrations as done. The outdated `schema/vra_crm_db.sql` is removed; migrations are now the only definition of the database.

## [0.2.0] - 2026-11-13

### Added

- Coding rules in `.claude/rules/` (architecture, server code, UI wording), and ESLint checks that keep UI components out of the database and `lib`/queries free of UI.
- Changelog and a semver release process: say "create a tag" to cut a release.

### Changed

- Consistent wording across the app: "Contact" for people, "Agent" for the salesperson, "Properties" instead of inventory or buildings, "Invoice no.", and sentence-case labels.
- The task export buttons now sit next to New task.
- Faster pipeline board, lead expiry, document lists and calendar on large data (new database indexes; run `db:migrate`).
- Each pipeline column shows its 200 most recent cards, with a link to the full list when there are more.
- Viewings show the last 30 days and upcoming by default, with an "All time" option.
- A campaign's recipients are shown 100 per page; its stats still count everyone.

- A cleaner system health page in Settings, with simple status dots and larger charts.
- Scheduled campaigns send up to four at once, so one large campaign no longer delays the others.

### Removed

- Five database tables the app never used (contact category assignments, contact field archive, document templates, notifications, property owners). `db:migrate` drops each only while it is empty.
- Outdated maintenance commands `db:reorder-stages` (replaced by migrations), `db:check-broker-scope` and `db:check-latest-contact` (debug scripts that printed personal data).
- Stale test reports whose generator no longer exists, a finished design plan, and unused type definitions.

### Fixed

- Saving a contact no longer overwrites the amount or commission of a won sale.
- Exports that reach their row limit now end with a note saying the file was cut off.
- Expired leads are no longer marked lost while staying in Leads when the Lost stage is switched off; they wait until it is back.
- Reassigning brokers re-checks won sales inside the same transaction, so a deal won mid-reassignment is never moved without the override.

## [0.1.0] - 2026-11-13

Baseline before releases were tagged. It covers all work up to commit `0dc86b6`.

### Added

- Contacts, sales pipeline (leads, opportunities, approvals, payment gates), billing and payments with commissions.
- Developments, properties, floors and units with images, archive and per-user property access.
- Calendar with viewings and repeating events, tasks, documents with previews.
- Marketing: email and SMS templates, campaigns with scheduling, and follow-ups.
- Reports (sales, forecast, agents, conversion) and a configurable dashboard.
- Roles and permissions, Master Broker teams, user handover, audit log, profile photos.
- CSV exports for reports, billing, payments, pipeline, properties and tasks.
- Automatic expiry of leads after 30 days.

### Security

- Organization and data-scope checks on every action and route, upload type checks, formula-safe CSV, patched dependencies.
