# Product context

VRA Land CRM is an organization-scoped real-estate CRM. Administrators, managers, brokers, and agents manage contacts, inventory, opportunities, and operational follow-up. Philippine address data, PHP defaults, and Manila date helpers establish a Philippines-focused implementation. Centralizing sales work and management oversight is an inferred purpose, not a confirmed business roadmap.

## Implemented surface

Routes are under [app/(crm)](../app/%28crm%29); the [navigation catalog](../src/components/layout/navigation.ts) declares module entry points. Visibility depends on permissions and additional server rules; a navigation item does not prove every related integration works.

| Area | Current capability | Source entry point |
| --- | --- | --- |
| Identity | Login, reset password, account profile; public sign-up disabled | [Auth](../src/lib/auth/auth.ts) |
| Contacts | Create/edit, duplicate checks, CSV import/export, assignments, approval status, notes, archive/restore, document requirements, ID OCR | [Contacts](../src/features/contacts) |
| Sales | Pipeline board/list, deal details, stage history, approval requests, lost outcomes | [Deals](../src/features/deals) |
| Inventory | Developments, properties, floors/units, images, access grants | [Developments](../src/features/developments), [properties](../src/features/properties) |
| Operations | Tasks and personal task list; calendar events, viewings, outcomes/feedback | [Tasks](../src/features/tasks), [calendar](../src/features/calendar) |
| Documents | File/template uploads and downloads, archive, signer records, signed-record list | [Documents](../src/features/documents) |
| Outreach | Email/SMS templates, campaign records, email sending via Resend, sequences, enrollment and manual step execution | [Marketing](../src/features/marketing) |
| Oversight | Dashboard panels and sales, forecast, agent and conversion reports | [Dashboard](../src/features/dashboard), [reports](../src/features/reports) |
| Billing | Administrator reservation-fee amount and paid/unpaid recording | [Billing](../src/features/billing) |
| Administration | Users, roles, data access, broker-agent onboarding, user documents, organization chart, deleted users, activity/audit and system views | [Settings](../src/features/settings) |

## Main journeys

1. A provisioned user signs in and sees the modules and records their access allows.
2. A user captures/imports a contact, resolves duplicate handling, assigns ownership and records preferences. Form creation opens a linked deal; CSV creation has an approval-dependent path. Contact approval is a separate state.
3. Users manage the opportunity through configured stages. Some moves create approval requests instead of immediately changing the stage. Tasks, viewings and documents support follow-up.
4. Inventory users browse developments/properties and permitted floors/units. Administrators or permitted grantors manage access.
5. Administrators record reservation payments and review users, audit history and reports. Marketing users create campaigns or execute sequence steps where the provider is implemented and configured.

See [sales workflows](sales-workflows.md) for branching and side effects, and [access control](access-control.md) for visibility decisions.

## Terminology that changes implementation decisions

| Term | Meaning in this repository |
| --- | --- |
| Contact / lead | A contact record has its own lifecycle and approval fields. A displayed pipeline stage is derived from linked deal data. |
| Opportunity / deal | UI and code names for the sales record stored in `deals`; not the contact itself. |
| Contact approval | Contact review status. It is distinct from approval of a requested deal-stage change. |
| Development / property / floor / unit | Related inventory levels. `units.buildingId` references a property; do not assume a separate buildings table. |
| Broker relationship | `users.brokerId` defines a user relationship; contacts and deals also retain their own broker fields. Changing one is not a universal cascade. |
| Role / permission / data scope | A role groups permissions and scope defaults. Permission grants an operation; scope restricts records. Inventory grants are another layer. |
| Billing | Reservation-fee bookkeeping on deals, not a payment gateway or subscription system. |

Sources: [database schema](../src/db/schema), [contact stage SQL](../src/features/contacts/lib/contact-stage-sql.ts).

## Boundaries and unknowns

As inspected on 2026-11-04:

- [SMS provider](../src/lib/messaging/providers.ts) and [e-sign provider](../src/lib/esign/provider.ts) factories return `null`. Social campaign sending is rejected by the marketing action. UI, templates, signer tables and signed-list routes do not establish live delivery or signing.
- Campaign scheduling fields and sequence delays exist, but no background scheduler/worker was found. Execution entry points are user-triggered actions. See [integration flows](architecture.md#integrations-and-execution).
- Sale/rent types and cancellation logic exist in code; this does not mean every organization enables corresponding stages or uses both transaction types.
- Production provider setup, live roles/grants/stages, actual usage, business priorities, and intended future policies remain unverified. Do not invent them from demo seeds.

**Update when:** a reachable feature, supported integration, user journey, domain term, or confirmed product goal changes.
