# Wording guide

Use these exact words everywhere users read them: pages, buttons, toasts, CSV exports, permission names and descriptions, and `CHANGELOG.md`.
Sentence case ("Gross list price"). Keep UI text short: a few words, no explanations in dialogs, headers or hints.
When a word isn't here, copy what the nearest existing page says, then add it here.

**One word per idea, everywhere.** A thing has one name across the whole app: page titles, tabs, buttons, dialog titles, field labels, toasts, errors, aria labels, CSV headers, permissions and `CHANGELOG.md`. When a term is renamed, rename every place users read it in the same change, add the new word here with the old one under Not, and search the code for the old word before calling it done. Names inside the code (types, columns) may stay as they are.

## Preferred terms

### Dashboard figures

| Say | Not | Where / notes |
|---|---|---|
| Reservations received this month | Reservation value, Total reservations (for an amount) | Reservation payments received during the current calendar month; show the payment count underneath. |
| Won sales value | Won (for an amount) | All-time value of won opportunities; collected payments are a separate amount. |
| Monthly payments received | Monthly paid | All-time payments classified as Monthly, not payments received during this month. Show "All time" underneath. |
| Payments received this month | Collected this month | All payment classifications received during the current calendar month. |

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
| Offer type | transaction type, listing, listing type, type (alone) | Sale, Rent or Lease, on a property and an opportunity. Also the CSV column. |
| Parking slot | parking space, Parking Slots | One slot. "Parking" as a section or list name. |
| Section | floor group, wing, zone | A named, coloured set of a property's floors, or their odd, even or picked units, such as Tower A or Sunrise. Set on the Design page. |
| Unit identifier, Identifier | numbering, unit number, unit code | What names a unit: letters (2A), numbers (201) or custom endings. Set with Identifier in Design floor. |
| Design properties | Manage floors, units and parking | The permission for the Design page: types, floors, floor plans, sections, identifiers, units and parking. |
| Unit ending | suffix, unit letter | The part of a unit identifier after its floor: A in 2A, 03 in 203. |
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

Found on 2026-11-20; items 1–38 were fixed on 2026-11-24 across contacts, opportunities, reports, billing, exports, permissions, settings, calendar and properties. Still open:

1. Calendar (in progress): `event-form.tsx` "On the calendar" → "Invite"; permission "Assign events to others" → reword with "Invite" once the change lands.

When you find a new one, add it here with the file and the quoted text, most visible first.
