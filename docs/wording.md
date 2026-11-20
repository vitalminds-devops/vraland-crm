# Wording guide

Use these exact words everywhere users read them: pages, buttons, toasts, CSV exports, permission names and descriptions, and `CHANGELOG.md`.
Sentence case ("Gross list price"). Keep UI text short: a few words, no explanations in dialogs, headers or hints.
When a word isn't here, copy what the nearest existing page says, then add it here.

## Preferred terms

### People

| Say | Not | Where / notes |
|---|---|---|
| Contact | client, buyer, customer, lead (for the person) | The person buying. "Lead" is a stage, not a person. |
| Agent | assigned agent, owner, assigned to, responsible agent | The user handling a contact, opportunity or viewing. Not for people invited to a calendar event (see Calendar). |
| Co-agent | second agent, partner | An extra agent on an opportunity. |
| Broker | supervisor, leader | The agent's broker. "Reassign broker". |
| Master Broker, Sales Manager, Administrator, Super Administrator | admin, superadmin, master broker | Role names keep the capitals shown on the Roles page. As a field label use sentence case: "Master broker", "Broker". |
| User | account, member, staff | Anyone who signs in. "Create user", "Archived users". |
| Assignee | assigned to, owner | Tasks only. |
| Created by | owner, creator, author | Tasks, events, campaigns. |

### Sales

| Say | Not | Where / notes |
|---|---|---|
| Opportunity / Opportunities | deal, sale, transaction | Any record in Sales pipeline, at any stage. Also CSV column names. |
| Lead | prospect, new deal | An opportunity in the Leads stage. "Contacts & leads" is the page name. |
| Leads, Opportunity, Reservation, CTS Signed - Won, Closed - Lost | Opportunity & Reservation, Cancelled (as a stage) | Stage names exactly as stored. Use them only when you mean the stage. |
| Move to Opportunity | convert, promote | The four-step dialog: Documents, Address, Property interest, Unit selection. |
| Won | closed, closed-won, closed sales | The outcome. "Won sales", "Won opportunities". |
| Lost, Cancelled | dropped, void | Outcomes. Cancelled is no longer a stage. |
| Expected close | close date, expected close date | Date an open opportunity should be won. |
| Closing | close, turnover | Calendar event type, and "Closing in the next 30 days". |
| Send for approval, Approve, Reject | request, deny | Stage changes that need approval. |

### Real estate

| Say | Not | Where / notes |
|---|---|---|
| Development | project | A group of properties. |
| Property / Properties | building, inventory, listing, tower | |
| Floor | level, storey | |
| Unit | lot, room, inventory | |
| Parking slot | parking space, Parking Slots | One slot. "Parking" as a section or list name. |
| Photo | picture, image | Profile, cover and unit photos. "Add photo", "Change photo". |
| Property access | grants, unit access | "Give access", "Save access", "Manage access". |

### Billing

| Say | Not | Where / notes |
|---|---|---|
| Bill | invoice, statement | "Billing statement" only on the printout. |
| Payment | transaction, collection | Types: Reservation, Monthly, Full. Methods: Cash, Check, Online, Bank financing, Pag-IBIG financing, In-house financing, Other. |
| Reservation fee | reservation amount, RF | |
| Invoice no. | invoice, invoice number, reference, OR no. | Column, field and search hint. |
| Date paid | paid on, payment date | |
| Transaction slip | receipt, proof of payment | Online payments only. |
| Not billed, Billed · unpaid, Partially paid, Fully paid | | Bill statuses. |
| Billing, Payments | | Page names. |

### Work and pages

| Say | Not | Where / notes |
|---|---|---|
| Dashboard, Contacts & leads, Sales pipeline, My team, Developments, Properties, Tasks, Calendar & viewings, Marketing, Documents, Reports & analytics, Billing, Payments, Settings | | Page names, as in the sidebar. Quote them as written. |
| Task | to-do, action item | Statuses: To do, In progress, Completed, Cancelled. |
| Viewing | tripping, site visit, showing | A property viewing on the calendar. |
| Event | appointment, entry | Any calendar item. Types: Viewing, Follow-up, Closing, Meeting, Event. |
| Follow-up | follow up, sequence, automation | Calendar type, task type and the Marketing follow-ups. |
| Campaign, Email template, SMS template, Step | blast, automation | Marketing. |
| Documents | files, library | The shared library of forms and templates. |
| Contact documents | client documents, requirements | A contact's document checklist. |
| Archive (verb), Archived (list) | trash, deleted, inactive | "Archived contacts", "Archived properties", "Archived users". |
| Reports | analytics, insights | In sentences. The page is "Reports & analytics". |
| Roles, Permissions | access rights, privileges | Settings pages and the user's Permissions section. |
| Data access | scope, visibility | Group of three permissions: "See own records", "See team records", "See all records". |
| Logs | audit trail, history | "View logs". |

## Calendar

Decided words (being implemented now):

| Use | Words |
|---|---|
| Field for who an event is for | Invite |
| Invite options | Only me, each user by name, Everyone |
| Popover row listing them | Invited |
| Responses | Accepted, Declined, Waiting for response |
| Actions | Accept, Decline |
| Decline field | Reason |
| Titles and buttons | Add event, Schedule viewing, Edit event, Edit viewing |
| Row for the creator | Created by |

- "Agent" stays the word for the agent on a contact, opportunity or viewing. Don't use it for people invited to an event.
- "Invited" is also a user status in Settings (account not yet used). Keep both; the context differs.
- Viewing statuses: Scheduled, Confirmed, Completed, Cancelled, No-show, Rescheduled.

## Buttons and actions

A button says exactly what it does: verb + thing. The toast repeats the verb in the past tense.

| Verb | Use for | Examples |
|---|---|---|
| Add | Opens a form for a new record, and that page's title. | Add contact, Add property, Add event, Add unit |
| Create | Submits a new-record form. | Create contact, Create task, Create user |
| Save changes | Submits an edit form. | |
| Save | Inline settings, or one form for new and edit. "Save all" for many rows. | Save access, Save bill, Save all |
| Edit | Opens the edit form. | Edit contact, Edit bill |
| Delete | Removes a record for good. Always confirm. | Delete opportunity, Delete campaign |
| Archive / Restore | Hides a record, and brings it back. Nothing is lost. | Archive, Restore contact |
| Remove | Takes an item off a record. | Remove payment, Remove photo, Remove floor, Remove slot |
| Upload / Replace / Download | Files. | Upload document, Replace, Download |
| Export | List pages; the file is CSV. | Export |
| Import CSV | Contacts import. | |
| Print | Printouts. | Print bill, Print / Save as PDF |
| Move to … | Stage moves. | Move to Opportunity, Move to Reservation |
| Reassign … | Hand over to another person. | Reassign agent, Reassign broker |
| Record payment, Schedule viewing, Send now, Give access | Domain actions; keep these exact words. | |
| Accept / Decline, Approve / Reject | Responses. | |
| Cancel | Closes a form or dialog without saving. | |
| Close | Dismisses something with nothing to save (viewer, popover, summary). | |
| Back to … | Link to the parent page. | Back to contacts, Back to pipeline |
| Back / Next | Steps inside one dialog. | |
| Discard changes | Confirms leaving with unsaved edits. | |
| Clear search, Select all / Clear all | Search box and checkbox lists. | |
| Sign in / Sign out | Not log in, log out. | |

- Don't use "New …" for buttons or page titles; use "Add …".
- Pending label: the verb + "ing…" with the ellipsis character `…`, not three dots: "Saving…", "Deleting…", "Archiving…".
- Confirm dialogs ask a short question and the confirm button repeats the action: "Delete this event?" → "Delete".

## Toasts and messages

| Kind | Pattern | Examples |
|---|---|---|
| Success | Thing + past tense, full stop. | "Event created.", "Contact archived.", "Payment recorded.", "Profile saved." |
| Edit saved | "… saved." | "Task saved.", "Bill saved." |
| Error, one line | "Couldn't …" + the reason or "Try again." | "Couldn't delete the development. Try again." |
| Error with description | Title says what failed, no full stop; description says why. | "Payment was not saved" / reason |
| File refused before upload | "… not accepted" + reason. | "Transaction slip not accepted" |
| Unknown outcome | "Couldn't confirm …" | "Couldn't confirm payment" |
| Form errors | One fixed line. | "Review the highlighted fields below." |
| Loading | `notifyLoading` with "…", then replaced by the result. | "Saving payment…", "Uploading document…" |

- Use "Couldn't", "can't", "don't". Not "Could not", "Unable to", "Failed to", "Error:".
- Show the action's own message (`result.error.message`) when it has one. Write those messages with the words in this guide.
- Plain words only: no codes, table names, "deal", "record not found", "invalid input".

## Dates and times

- The business runs on Philippine time (Manila). Use `@/lib/utils/manila-time`.
- Date: "Nov 20, 2026". Short: "Nov 20". Month: "November 2026". Chart axis: "Nov 26".
- Date and time: "Nov 20, 2026, 9:00 AM" (`manilaDateTime`). Times are 12-hour: "9:00 AM".
- Day heading: "Friday, Nov 20". Ranges use an en dash: "9:00 AM – 10:00 AM".
- Day before month ("20 Nov") and 24-hour times ("14:00") are not used.
- `yyyy-MM-dd` is for inputs and files only, never for display.

## Money and numbers

- Pesos with ₱ and commas: "₱1,500,000.00" for bills and payments (`peso` in `billing/lib/format`), "₱1,500,000" for prices and budgets (`formatPeso` in `contacts/lib/format`).
- Compact on dashboards, charts and budget ranges: "₱9.9M", "₱1.5M – ₱4M" (`compactCurrency`, `formatPesoRange`).
- Field labels: "Amount (₱)". CSV headers use the code: "Amount (PHP)".
- Missing values show "—".
- Area: "45 sqm". Mobile numbers: "+63 917 123 4567".
- Don't write another `money()` helper; reuse the ones above.

## Inconsistencies found

Found on 2026-11-20. Line numbers drift; search for the quoted text. Most visible first.

1. `src/features/contacts/components/pipeline-stage-badge.tsx:20` "No deal" → "No opportunity" (contacts list).
2. `app/(crm)/contacts/new/page.tsx:27` step "Deal" → "Opportunity".
3. `src/features/contacts/components/contact-form.tsx:796-808` section "Deal", "You can't edit this deal.", "You can't create deals.", "A deal opens in Leads automatically." → "Opportunity", "opportunity", "It starts in Leads."
4. `app/(crm)/dashboard/page.tsx:210` "Closed sales & forecast" → "Won sales & forecast"; same in `src/lib/permissions/catalog.ts:116-117` ("Show closed sales & forecast").
5. `src/features/dashboard/components/dashboard-charts.tsx:81`, `src/features/reports/components/report-charts.tsx:71,206` "Closed sales" → "Won sales".
6. `app/(crm)/reports/sales/page.tsx:169` "No closed sales in this period" → "No won sales in this period".
7. `app/(crm)/reports/forecast/page.tsx:88` "No open deals are expected in this period." → "No open opportunities expected in this period."
8. `app/(crm)/billing/page.tsx:144` "Search client, broker, …" → "Search contact, broker, …".
9. `app/(crm)/properties/[id]/page.tsx:89` "Present to client" → "Present".
10. `src/features/contacts/components/contact-form.tsx:852` "Notes about this client" → "Notes about this contact".
11. `src/features/deals/components/opportunity-dialog.tsx:697` "Enter the client's TIN number" → "Enter the contact's TIN".
12. `src/features/deals/components/opportunity-units.tsx:45` "…for this client?" → "…for this contact?"
13. `src/features/deals/components/opportunity-dialog.tsx:1064` "Select a building and unit…" → "Select a property and unit…".
14. `src/features/properties/components/property-floor-unit-selector.tsx:193,203` "Building" → "Property".
15. `app/(crm)/billing/[dealId]/page.tsx:404` label "Project" → "Development"; `app/(crm)/developments/[id]/edit/page.tsx:39` "Update this project." → "Update this development."
16. `app/api/billing/export/route.ts:36` and `app/api/payments/export/route.ts:26` column "Deal" → "Opportunity"; payments "Paid on" → "Date paid".
17. `app/api/tasks/export/route.ts:42` column "Assigned to" → "Assignee".
18. `app/(crm)/payments/page.tsx:200` "Invoice: …" / "No invoice number" → "Invoice no. …" / "No invoice no."
19. `src/features/marketing/components/enrollment-form.tsx:75,79,84,96,98` "deal" → "opportunity"; `src/features/documents/components/document-forms.tsx:155` "No deal" → "No opportunity".
20. `src/lib/permissions/catalog.ts:174,178` and module label "Client documents" → "Contact documents" ("View contact documents", "Manage contact documents"); same wording in `permission-details.ts:129,206-220,619,649`.
21. `src/lib/permissions/catalog.ts` "Create tasks" → "Add tasks" (every other add permission says "Add").
22. `src/lib/permissions/permission-details.ts:227,232,233,236,820` "inventory" → "properties" / "units".
23. `app/(crm)/marketing/campaigns/new/page.tsx:18`, `automations/new/page.tsx:16`, `email-templates/new/page.tsx:18`, `sms-templates/new/page.tsx:18` "New …" → "Add …".
24. `src/features/settings/components/settings-forms.tsx:418,482` "Create account" → "Create user" (the heading says "Create user").
25. `src/features/reports/components/report-shell.tsx:58` "Export CSV" → "Export".
26. `app/(crm)/account/page.tsx:20` and `src/features/contacts/lib/contact-write-error.ts:24` "Ask an admin…" → "Ask an Administrator…"; `src/features/deals/lib/stage-transitions.ts:138` "Only admins can…" → name the roles.
27. Three dots instead of `…`: `contact-form.tsx:877` "Saving...", `property-form.tsx:621` "Saving...", `contact-row.tsx:281` "Archiving...", `broker-reassign-modal.tsx:282` "Reassigning...", `sign-out-button.tsx:25` "Signing out...", `src/components/ui/toolbar-helpers.tsx:13` "Search name, email, code...".
28. `src/features/contacts/components/contact-row.tsx:93` "Contact archived" → "Contact archived."
29. "Could not" / "Unable to" → "Couldn't": `document-forms.tsx:224,249` "Unable to archive." / "Unable to restore.", `parking-slots.tsx:64` "Parking could not be updated.", `pipeline-board.tsx:238` "Could not move to …", "Could not confirm …" in `avatar-field.tsx:49`, `payment-dialogs.tsx:182`, `import-form.tsx:62`, `requirement-checklist.tsx:77`, `document-forms.tsx:97`, `unit-picture-dialog.tsx:81`; `password-forms.tsx:98` "Passwords do not match." → "Passwords don't match."
30. `src/features/developments/components/development-form.tsx:173` "Review the highlighted fields." → "Review the highlighted fields below."
31. Viewing statuses shown raw and lowercase ("no show"): `src/features/calendar/components/viewing-status.tsx:48`, `app/(crm)/calendar/viewings/page.tsx:71,101` → "Scheduled", "No-show", ….
32. `src/features/tasks/lib/task-options.ts:75` task type shows "Follow up" → "Follow-up".
33. Title Case: `src/features/billing/components/bill-form.tsx:231` "Applicant Information", `src/features/billing/lib/bill-applicant.ts:12-24` "Last Name", "Civil Status", …, `contact-form.tsx:595` "Mobile Phone 1", `opportunity-dialog.tsx:959` "Parking Slots (Optional)", `floors-and-units.tsx:221` and `parking-slots.tsx:169` "Top View", `src/components/layout/navigation.ts` section "Real Estate".
34. Day before month: `src/features/dashboard/components/closing-soon.tsx:42` and `src/features/dashboard/queries/dashboard.queries.ts:551` use "d MMM" ("20 Nov") → "MMM d".
35. 24-hour times: `src/features/calendar/components/event-popover.tsx:128` "HH:mm" and the default in `src/features/calendar/lib/calendar-helpers.ts:15` → "h:mm a".
36. "Picture" → "Photo": `src/features/properties/components/unit-picture-dialog.tsx:55,59,150,174` ("Add picture", "Replace picture", "No picture yet", "Uploading unit picture…"), permission "Manage unit pictures" and `permission-details.ts:283,329,339`. Also `avatar-field.tsx:77,115` "Add a photo" / "Upload photo" → "Add photo".
37. `src/features/deals/components/pipeline-board.tsx:596` "Expected close date" → "Expected close".
38. `app/(crm)/documents/archive/page.tsx:20` "Shared file archive" → "Archived documents".
39. Calendar (in progress): `event-form.tsx:222` "On the calendar" → "Invite"; permission "Assign events to others" → reword with "Invite" once the change lands.
