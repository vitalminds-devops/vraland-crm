import type { PermissionKey } from "./catalog";

/**
 * What each permission really does in the app, and every condition that limits it, worked out from
 * the code that checks it. Shown in the permission pickers' info tooltips. Keep it in step with the
 * code: when a check changes, change its entry here.
 */
export type PermissionDetail = {
  /** One plain sentence. */
  allows: string;
  /** Other permissions it needs, whose records it reaches, role-based limits, guards and rules. */
  conditions: readonly string[];
  /** No feature checks this permission yet, so granting it changes nothing. */
  unused?: true;
};

export const permissionDetails = {
  "dashboard.view": {
    allows: "Open the Dashboard page and see it in the sidebar.",
    conditions: [
      "Each panel also needs its own dashboard panel permission and record view permission",
      "Figures cover records in their data access: own, team or all",
      'Without "See all records", tasks and viewings count only those assigned to them',
      "Properties are counted only if granted, unless Administrator or Super Administrator role",
      "Opportunities of archived contacts are left out of every figure",
      'Without any panel permission, shows "No dashboard panels for your role"',
      "Without it, opening /dashboard redirects to the Forbidden page",
    ],
  },
  "dashboard.view_pipeline": {
    allows: "Show a chart of opportunity counts per pipeline stage on the dashboard.",
    conditions: [
      'Needs "View dashboard" to open the dashboard',
      'Needs "View sales pipeline" (opportunity access)',
      "Counts only opportunities in their data access: own, team or all",
      "Includes won and lost opportunities; active stages only; empty stages hidden",
      "Opportunities of archived contacts are not counted",
    ],
  },
  "dashboard.view_metrics": {
    allows:
      "Show dashboard figures for sales values, payments received, properties, units, floors and contacts.",
    conditions: [
      'Needs "View dashboard" to open the dashboard',
      'Active contacts card needs "View contacts & leads"; counts contacts not yet converted',
      'Active properties card needs "View properties"; only properties the user has access to, unless they have "Access all properties"',
      'Open opportunities card needs "View sales pipeline"; count and total value of open opportunities',
      'Payments received this month and Monthly payments received cards need "View sales pipeline" and "View billing"',
      "All cards count only records in their data access: own, team or all",
    ],
  },
  "dashboard.view_revenue": {
    allows: "Show a revenue chart: won sales and weighted forecast over recent and coming months.",
    conditions: [
      'Needs "View dashboard" to open the dashboard',
      'Needs "View sales pipeline" (opportunity access)',
      "Won sales from the last 6 months; forecast for the next 6 months",
      "Forecast weights open opportunity amounts by their win probability",
      "Only opportunities in their data access; archived contacts' opportunities excluded",
    ],
  },
  "dashboard.view_summary": {
    allows: "Show the Summary panel of quick readings for this month and next 7 days.",
    conditions: [
      'Needs "View dashboard" to open the dashboard',
      "Each reading needs its own access: tasks, calendar, contacts, opportunities or properties view",
      "Panel hidden when they hold none of those record permissions",
      "Overdue tasks reading hidden while the Open tasks by due date panel is shown",
      "Reserved properties reading hidden while the Properties by status panel is shown",
      "Readings count only records in their data access; tasks/viewings only theirs unless view-all",
    ],
  },
  "dashboard.view_priorities": {
    allows: "Show open tasks and upcoming viewings due within the next 7 days, overdue first.",
    conditions: [
      'Needs "View dashboard" to open the dashboard',
      'Tasks part needs "View tasks"; viewings part needs "View calendar & viewings"',
      'Without "See all records", only tasks assigned to them and their own viewings',
      "Team data access does not widen this list; it stays personal",
      "Lists at most 8 tasks and 8 scheduled or confirmed viewings",
    ],
  },
  "dashboard.view_closings": {
    allows: "Show open opportunities expected to close within the next 30 days.",
    conditions: [
      'Needs "View dashboard" to open the dashboard',
      'Needs "View sales pipeline" (opportunity access)',
      "Only opportunities in their data access: own, team or all",
      "Shows at most 6, soonest first; archived contacts' opportunities excluded",
    ],
  },
  "dashboard.view_task_load": {
    allows:
      "Show open task counts: overdue, due today, this week, unscheduled, completed this week.",
    conditions: [
      'Needs "View dashboard" to open the dashboard',
      'Needs "View tasks"',
      'Without "See all records", counts only tasks assigned to them',
      "Team data access does not widen these counts",
      "Hides the Summary panel's overdue tasks reading while shown",
    ],
  },
  "dashboard.view_inventory": {
    allows: "Show how many properties are in each status.",
    conditions: [
      'Needs "View dashboard" to open the dashboard',
      'Needs "View properties"',
      "Counts only properties granted to them, unless Administrator or Super Administrator role",
      "Team or own data access does not narrow properties further than property access",
      "Hides the Summary panel's reserved properties reading while shown",
    ],
  },
  "dashboard.view_activity": {
    allows: "Show the 8 latest activity entries on records they can reach.",
    conditions: [
      'Needs "View dashboard" to open the dashboard',
      "Needs at least one of contacts, opportunities, properties, tasks or calendar view",
      "Only activity from modules the user can open (contacts, opportunities, tasks, calendar, properties, developments, documents)",
      'With "See all records", that activity across the organization',
      "Otherwise: their own actions, or activity on contacts/opportunities/properties/tasks in their access",
    ],
  },
  "contacts.view": {
    allows: "Open the Contacts list and contact pages, and search for duplicate contacts.",
    conditions: [
      "Shows only contacts within the user's data access, never archived ones",
      "See own records: only contacts assigned to the user, not ones they created",
      "See team records: contacts assigned to them or their agents, or brokered by them",
      "Also needed to open Add contact, Edit contact and contact documents pages",
      "Duplicate check shows matches outside data access without their details",
      "Shows the Contacts menu item and the dashboard leads count",
      'Without "Edit contacts", the Edit button, note box and Add details links are hidden',
    ],
  },
  "contacts.create": {
    allows: "Add new contacts one at a time from the Add contact form.",
    conditions: [
      'Needs "View contacts & leads" too; the form page loads contact options',
      "No two contacts may share an email or mobile number",
      "Assigned agent must be within the user's data access",
      "Development and units must belong to the organization",
      "New contacts are approved at once and get an opportunity automatically",
      "Fails if no active pipeline stage exists",
      "Unassigned contacts may then be invisible to users who see only own records",
      "The Add contact buttons show only with this permission",
    ],
  },
  "contacts.update": {
    allows: "Edit contact details, add notes and update their details when opening an opportunity.",
    conditions: [
      "Only contacts within the user's data access",
      'Needs "View contacts & leads" too to open the edit page',
      "Email and mobile must not belong to another contact",
      'Changing the assigned agent also needs "Reassign a contact\'s broker"',
      'Saving the contact\'s opportunity also needs "Edit opportunities"; a new one needs "Add opportunities"',
      'Moving a lead to Opportunity also needs "Move opportunities between stages"',
      "Changing agent moves the contact's open opportunities to the new agent",
    ],
  },
  "contacts.delete": {
    allows: "Archive contacts, see the archived contacts list, and restore archived contacts.",
    conditions: [
      "Only contacts within the user's data access",
      "Archiving is soft; records are kept and can be restored",
      "Blocked if an open or won opportunity holds units, parking or payments",
      "Archiving cancels the contact's open tasks, automations and upcoming viewings",
      "Restore blocked for expired leads; they must be added again",
      "Restore blocked if the email or mobile now belongs to another contact",
      "Archived button on Contacts shows only with this permission",
    ],
  },
  "contacts.import": {
    allows: "Bulk-add contacts from a CSV file on the Contacts page.",
    conditions: [
      'Import button sits on the Contacts page, so "View contacts & leads" is needed in practice',
      'Does not require "Add contacts"',
      "CSV under 2 MB and at most 1,000 rows",
      "Rows sharing an email or mobile with any contact are skipped",
      "Matches outside data access are reported without naming the contact",
      "Agent, development and units must be valid and within reach",
      "Imported contacts are approved and get an opportunity automatically",
    ],
  },
  "contacts.export": {
    allows: "Download contacts as a CSV file.",
    conditions: [
      "Exports only non-archived contacts within the user's data access",
      'Does not itself require "View contacts & leads"; the Export button is on the Contacts page',
      "Includes contact details, income, budget, broker and approval status",
    ],
  },
  "contacts.reassign_broker": {
    allows:
      "Move contacts and their open opportunities to another broker, or change a contact's agent.",
    conditions: [
      'Broker reassignment also needs "See all records"',
      'The Reassign broker menu shows only with this and "See all records"',
      "Target must be an active broker in the organization",
      "Up to 500 contacts at once; a reason is required",
      "Contacts with won sales are blocked; only Super Administrator can override",
      "Also required to change a contact's assigned agent when editing",
    ],
  },
  "requirements.view": {
    allows: "See a contact's document checklist and which items were submitted.",
    conditions: [
      'Needs "View contacts & leads" too',
      "Only contacts within the user's data access",
      'Opening an uploaded file also needs "View documents"',
      "Sensitive contact files (IDs, income, bank) also need sensitive-document access",
    ],
  },
  "requirements.manage": {
    allows: "Add, upload files for, and remove items on a contact's document checklist.",
    conditions: [
      'Needs "View contact documents" and "View contacts & leads" to reach the page',
      "Only contacts within the user's data access",
      "Uploads: PDF, JPEG or PNG only, up to 15 MB",
      "Uploaded contact files are marked sensitive, except the appointment form",
      "Removing a checklist item keeps any uploaded file",
      "Can re-add missing standard checklist items",
    ],
  },
  "properties.view": {
    allows:
      "Open the Properties list, property pages, unit layouts, floor and unit photos and the properties CSV export.",
    conditions: [
      "Covers properties in the user's organization only; archived properties are hidden",
      "Non-administrators see only properties someone granted them",
      "Access to part of a property shows only those floors, units and parking; units left out are hidden",
      "Ungranted floors and units have no placeholders or hidden-unit counts",
      'With "Access all properties", every property and unit shows without property access',
      "Data access (own/team/all) does not narrow viewing properties",
      "Also needed to pick units and parking on an opportunity",
      "Also lights up the dashboard property KPI and properties-by-status panels, when those panels are allowed",
      "Shows the Properties menu item",
      "Required alongside property-access granting; the access page needs it",
    ],
  },
  "properties.create": {
    allows: "Add new properties, including from a development's page.",
    conditions: [
      "The chosen development must belong to the user's organization",
      'Floors, units and parking are added afterward, needing "Design properties"',
      "Non-administrators automatically get whole-property access to what they create",
      "Shows the New property button on the list and the development page",
    ],
  },
  "properties.update": {
    allows: "Edit a property's details, address, features and status.",
    conditions: [
      'Prices and fees are set on unit and parking types, with "Manage prices"',
      "Only properties within the user's data access, based on who created them",
      "With own-records access: only properties they created themselves",
      "Non-administrators also need access to the whole property; access to some floors or units is view only",
      "Archived properties cannot be edited",
      "The Edit button shows only for properties the user can actually save",
    ],
  },
  "properties.delete": {
    allows: "Archive properties, view archived properties, and restore them.",
    conditions: [
      "Archiving hides the property; it is not permanently deleted",
      "Blocked while an open opportunity uses its units, parking or property",
      "Only properties within the user's data access, based on who created them",
      "Non-administrators also need access to the whole property; access to some floors or units is view only",
      "The archive list shows only properties the user could restore",
    ],
  },
  "properties.manage_units": {
    allows:
      "Use the Design page: unit and parking types, floors and floor plans, sections, unit identifiers, and adding, renaming and removing units and parking slots and changing their status.",
    conditions: [
      "Only properties within the user's data access, based on who created them",
      "Non-administrators also need access to the whole property; access to some floors or units is view only",
      "Can't change status of a unit/slot held by an open or won opportunity",
      "Can't remove sold or reserved units/slots, or ones on open opportunities",
      "Removing a floor removes its units; same sold/reserved blocks apply",
      "Adds at most 100 floors, units or slots at a time",
      "Hidden in presentation mode",
    ],
  },
  "properties.manage_prices": {
    allows:
      "Set the price, reservation fee and monthly amortization of unit types, parking types, units and parking slots.",
    conditions: [
      'Changing a type also needs "Design properties"',
      "Non-administrators also need access to the whole property",
      "Without it, types can still be designed and renamed, but no amount changes",
      "A new price reaches units and slots still available; reserved and sold ones keep theirs",
    ],
  },
  "properties.manage_unit_pictures": {
    allows: "Upload, replace and remove unit photos.",
    conditions: [
      "JPEG, PNG or WebP only, 5 MB maximum",
      "Only properties within the user's data access, based on who created them",
      "Non-administrators also need access to the whole property; access to some floors or units is view only",
      "Hidden in presentation mode",
    ],
  },
  "properties.grant_unit_access": {
    allows: "Give or remove other users' access to properties, floors, units and parking.",
    conditions: [
      "Also needs View properties",
      "Only active, non-administrator users other than yourself can receive access",
      "Master Broker: may give access only to broker-type roles and agents",
      "Broker-type roles: may give access only to their own team members",
      "Who can receive access follows the team structure (Master Broker, broker-type roles, agents), not permissions",
      "Non-administrators can only share what they hold themselves",
      "The editor shows only the caller's granted floors and units; exclusions are inherited when sharing a floor",
      "Sold, reserved or inactive units and parking can't be newly granted",
      'Granting every property at once needs "Access all properties"',
    ],
  },
  "properties.access_all": {
    allows:
      "See and change every property, floor, unit and parking slot without being given property access.",
    conditions: [
      "Administrators have it by default",
      "Still needs the matching View, Edit or Design permission for each action",
      "Can give access to every property at once",
    ],
  },
  "properties.view_all_access": {
    allows: "See everyone's property access on a property's Access page.",
    conditions: [
      'Opens the Access page view-only, even without "Give property access"',
      "View-only shows who has access; nothing can be changed",
      "With \"Give property access\", lists everyone's access instead of only the user's own reach",
      'Also needs "View properties"',
    ],
  },
  "developments.view": {
    allows: "Open the Developments list, development pages and cover images.",
    conditions: [
      "Shows every development in the organization, regardless of property access",
      "Properties, floors and units inside show only those granted to non-administrators",
      "Data access (own/team/all) does not narrow developments",
      "Shows the Developments menu item",
    ],
  },
  "developments.create": {
    allows: "Add new developments.",
    conditions: ["Created in the user's own organization", "Shows the New development button"],
  },
  "developments.update": {
    allows: "Edit a development's details and upload or remove its cover photo.",
    conditions: ["Any development in the organization; no data access or property access limit"],
  },
  "developments.delete": {
    allows: "Delete an empty development from its page.",
    conditions: [
      "Only developments in the user's organization",
      "Refused while any property uses it, archived ones included",
      "Refused while any unit or opportunity uses it",
      "Contacts that only prefer it don't block it; the preference is cleared",
      "Its cover photo is removed too; the deletion can't be undone",
    ],
  },
  "deals.view": {
    allows:
      "See the pipeline board, opportunity list, lost analysis and opportunity pages, and export opportunities to CSV.",
    conditions: [
      "Shows only opportunities in the user's data access (own, team or all)",
      "Own access means opportunities where the user is the primary agent",
      "Team access adds the team's agents' opportunities and ones where the user is broker",
      "Opportunities whose lead contact is archived are hidden",
      "Won, lost and cancelled opportunities leave the board 90 days after their last change",
      'Approvals page also needs "Approve stage changes"',
      'Does not open Billing; that needs "View billing"',
    ],
  },
  "deals.create": {
    allows: "Open a new opportunity for a contact, or another opportunity for a different unit.",
    conditions: [
      "New opportunities can only start in the Leads stage",
      "The contact must be in the user's data access",
      "The chosen agent must be an eligible agent within the user's data access",
      'If the contact already has one, it edits that instead (needs "Edit contacts", "Edit opportunities")',
      "Another opportunity: only from an opportunity past Leads that the user can access",
      "Saving a new contact opens a Lead automatically, even without this permission",
      "Without it, the contact form hides the opportunity stage options",
    ],
  },
  "deals.export": {
    allows: "Download the Opportunity list, with its filters, as a CSV file.",
    conditions: [
      'Also needs "View sales pipeline"',
      "Only opportunities in the user's data access",
      "Up to 10,000 rows per file",
    ],
  },
  "deals.update": {
    allows:
      "Edit an opportunity's type, value, expected commission and expected close from the contact form.",
    conditions: [
      'Also needs "Edit contacts"; edits happen only through the contact\'s edit form',
      `Changing an opportunity's units, which re-totals its bill, needs this and "Move opportunities between stages"`,
      "Only opportunities in the user's data access",
      "A won opportunity's value and commission cannot be changed",
      'Changing the stage in the same form also needs "Move opportunities between stages"',
      'Changing the agent there also needs "Reassign an opportunity\'s agent"',
      "Changing units or moving stages on the opportunity page does not use this permission",
    ],
  },
  "deals.delete": {
    allows: "Delete an opportunity entered by mistake from its page.",
    conditions: [
      "Only opportunities in the user's data access",
      "Agents only their own opportunities; brokers only ones where they are broker",
      "Won opportunities can't be deleted",
      "Refused while it has payments; remove them in Billing first",
      "Refused while it holds reserved or sold units or parking",
      "Refused for a contact's only opportunity; archive the contact instead",
      "Cancels its open tasks, follow-ups and pending approval requests",
      "There is no undo",
    ],
  },
  "deals.change_stage": {
    allows: "Move opportunities along the pipeline and mark them lost.",
    conditions: [
      "Only opportunities in the user's data access",
      "Agents may move only opportunities where they are the primary agent",
      "Brokers may move only opportunities where they are the broker",
      "Custom roles move by their data access: own records like an Agent, team like a Broker, all like a Sales Manager",
      "Forward moves go one stage at a time; no skipping",
      'Leads to Opportunity needs "Edit contacts", "View properties", TIN, units, payment method, valid ID and appointment form',
      "Opportunity to Reservation needs the reservation fee paid, summed over all units",
      "Reservation to Won needs the monthly amortization paid, summed over all units",
      "Stages needing approval send a request instead, unless the user can approve",
      "Fully paid opportunities cannot be marked lost or cancelled",
      "Changing a Won or Cancelled outcome forward: Super Administrator, Administrator, Master Broker only",
      'Moving back needs "Move opportunities back"; lost ones reopen only to Leads or Opportunity',
      "Reaching Won records commissions; leaving Won deletes them",
      "Recording a payment auto-moves the stage only if the user also has this",
    ],
  },
  "deals.reassign_agent": {
    allows: "Move an opportunity to another agent from its page.",
    conditions: [
      "Only opportunities in the user's data access",
      "The new agent must be an eligible, active agent within the user's data access",
      "A reason is required and kept in the activity and audit log",
      "On a Won opportunity the commission moves too, recalculated at today's rates",
      "The contact form never changes an opportunity's agent",
      "Open opportunities also follow the contact's agent when it changes (\"Reassign a contact's broker\")",
    ],
  },
  "deals.approve_stage_change": {
    allows:
      "Approve or reject stage-change requests, and move into approval stages without requesting approval.",
    conditions: [
      'Approvals page also needs "View sales pipeline"',
      "Only requests on opportunities in the user's data access",
      "Cannot approve their own request",
      "Rejecting requires a reason",
      "Approving applies all stage rules to the approver: own-deal limits, payment gates, one stage",
      'Approving does not need "Move opportunities between stages"',
      'Their own direct moves still need "Move opportunities between stages"',
      "Their lost or cancelled moves need no reason and no approval",
      "An approved Mark lost keeps the requester's loss reason",
    ],
  },
  "deals.move_back": {
    allows:
      "Move an opportunity to an earlier stage, including reopening won, lost or cancelled ones.",
    conditions: [
      'Also needs "Move opportunities between stages"',
      "A reason is always required",
      "One stage back at a time, except Super Administrator, Administrator, Master Broker",
      "Agents only their own opportunities; brokers only ones where they are broker",
      "Lost opportunities reopen only to Leads or Opportunity",
      "Only opportunities in the user's data access",
      "Reopening a Won opportunity removes its commissions",
    ],
  },
  "tasks.view": {
    allows:
      "Open the Tasks and My tasks pages, export tasks to CSV, and see dashboard task panels.",
    conditions: [
      "Shows tasks by assignee only: own, team's, or all per data access",
      "Creator loses sight of a task once it is assigned to someone outside their scope",
      "My tasks always shows only tasks assigned to you",
      "Task rows show the original creator separately from the current assignee",
      "Dashboard task panels also need the matching dashboard panel permission",
      "Export is capped at 10,000 rows",
      "Opportunity pages list up to 20 linked tasks even without this permission",
    ],
  },
  "tasks.create": {
    allows: "Add new tasks, optionally linked to a contact, property or opportunity.",
    conditions: [
      'Needs "View tasks" to reach the Tasks page and its add button',
      "Linked contact and opportunity must be within the user's data access",
      "Linked property must be one the user has been granted access to",
      "Assignee must be an active user within the user's data access",
      "Own records: only themselves; team: themselves or their team; all: anyone active",
      "Unassigned tasks default to the user",
    ],
  },
  "tasks.update": {
    allows: "Edit task details, reassign tasks, and change task status or mark them done.",
    conditions: [
      "Only tasks whose assignee is within the user's data access",
      'Needs "View tasks" to reach the task list',
      "New links follow the same contact, property and opportunity checks as creating",
      "A new assignee must be an active user within the user's data access",
      "Keeping an existing assignee outside that range still saves",
    ],
  },
  "tasks.delete": {
    allows: "Remove tasks from the task list.",
    conditions: [
      "Only tasks whose assignee is within your data access",
      "Needs View tasks to reach the task list",
      "Removal is a soft delete; audit log and activity keep the record",
    ],
  },
  "calendar.view": {
    allows:
      "Open the calendar, follow-ups, closings and viewings pages, and dashboard viewing panels.",
    conditions: [
      "Without See all records: only events you created or are invited to",
      "With See all records: every event in the organization",
      "Viewings list without See all records: only viewings where you are the agent",
      "Team data access does not widen calendar or viewings visibility",
      "Pickers list contacts in your data access and properties you're granted",
      "Dashboard viewing panels also need the matching dashboard panel permission",
    ],
  },
  "calendar.manage": {
    allows: "Add events, and change or delete the events you created.",
    conditions: [
      "Needs View calendar & viewings to reach the pages and forms",
      "Events are only for you unless you can Invite others to events",
      "Only an event's creator can edit or delete it, unless Edit and delete others' events",
      "Viewings have their own permissions below",
    ],
  },
  "calendar.assign": {
    allows: "Invite chosen active users to an event.",
    conditions: [
      "Needs Add events",
      "Each person invited accepts or declines; a decline needs a reason the creator can read",
      "Changing the time or who is invited asks them to respond again",
    ],
  },
  "calendar.broadcast": {
    allows: "Invite every active user in the organization to an event at once.",
    conditions: [
      "Needs Add events",
      "Invites the people active when the event is saved; later users are not added",
      "Each person accepts or declines like any invite",
    ],
  },
  "calendar.edit_others": {
    allows: "Change or delete events created by someone else.",
    conditions: [
      "Needs Add events",
      "Without it, only an event's creator can edit or delete it",
      "Viewings follow their own permissions",
    ],
  },
  "calendar.schedule_viewings": {
    allows: "Schedule property viewings for a contact.",
    conditions: [
      "Needs View calendar & viewings",
      "The contact and property must be within your data access and granted properties",
      "Booked under yourself unless you can Schedule viewings for other agents",
      "Blocks double-booking an agent's overlapping scheduled or confirmed viewings",
    ],
  },
  "calendar.assign_viewings": {
    allows: "Pick another agent for a viewing.",
    conditions: ["Needs Schedule viewings", "The agent must be an active user"],
  },
  "calendar.update_viewings": {
    allows:
      "Edit and reschedule viewings, and mark them confirmed, completed, no-show or cancelled.",
    conditions: [
      "Only viewings where you are the agent, the creator or on the opportunity, unless See all records",
      "Marking a viewing completed can enrol the contact in marketing follow-ups",
    ],
  },
  "calendar.delete_viewings": {
    allows: "Delete a viewing.",
    conditions: [
      "Only viewings where you are the agent, the creator or on the opportunity, unless See all records",
      "Completed or no-show viewings cannot be deleted",
    ],
  },

  "marketing.view": {
    allows:
      "See marketing campaigns, follow-up automations, email and SMS templates, and campaign results.",
    conditions: [
      "Campaigns, results and counts cover the whole organization",
      "Recipients' names, emails and mobile numbers show only for contacts in the user's data access",
      'Other recipients show as "Contact outside your access", with no personal details',
      "Follow-up enrolments are masked the same way, including the opportunity title",
      "Contact and opportunity pickers are limited to the user's data access",
    ],
  },
  "marketing.manage": {
    allows:
      "Create campaigns, templates and follow-ups, add steps, enrol people, pause campaigns, toggle templates.",
    conditions: [
      'Needs "View marketing" for the list and detail pages',
      "Recipients must be consenting contacts within the user's data access",
      "Enrolled contacts or opportunities must be within the user's data access",
      "Only active follow-ups accept enrolments; no duplicate active enrolment",
      "Existing templates cannot be edited, only switched on or off",
      "Completed campaigns cannot be paused",
      "Scheduled campaigns send automatically, within a minute of their time",
      "A scheduled campaign that can't send (social, or no provider set up) goes back to draft",
    ],
  },
  "marketing.send": {
    allows: "Send email or SMS campaigns and run the next step of a follow-up.",
    conditions: [
      "Needs View marketing to reach the send buttons",
      "Sends to every recipient on the campaign, regardless of your data access",
      "Only draft, scheduled or paused campaigns can be sent",
      "Email or SMS provider must be configured; social campaigns cannot send",
      "Skips contacts who withdrew consent or were archived",
      "Follow-up steps run only once their wait time has passed",
      "Task steps assign to the contact's agent, else the opportunity's agent",
    ],
  },
  "marketing.delete": {
    allows: "Delete campaigns, follow-up automations, and email or SMS templates.",
    conditions: [
      "Needs View marketing to reach the delete buttons",
      "Campaigns that started sending or completed cannot be deleted",
      "Follow-ups with anyone enrolled, ever, cannot be deleted",
      "Templates used by an unfinished campaign cannot be deleted",
      "Templates used by an active follow-up cannot be deleted",
      "Applies to any marketing record in the organization",
    ],
  },
  "documents.view": {
    allows: "Open Documents to view, download, print or save shared files as PDF.",
    conditions: [
      "Shared files are available across the user's organization, regardless of own or team record access",
      "PDFs open in the browser PDF viewer; images can be printed or saved as PDF through the print dialog",
      "Documents and its archive list shared files separately from contact documents",
      "Documents on contacts and opportunities follow the user's data access",
      "Property documents follow property access",
      "Unlinked documents: those the user (or team) uploaded, per data access",
      "Sensitive documents hidden unless allowed by sensitive-document rules",
      "User onboarding files are never shown here",
      "Also needed to open files from a contact's document checklist",
    ],
  },
  "documents.manage": {
    allows: "Upload documents to the records the user can manage.",
    conditions: [
      'Needs "View documents" to reach the Documents pages',
      'Archive and Restore need the separate "Archive documents" permission',
      "Record-linked uploads: PDF, DOCX, JPEG, PNG or text, up to 15 MB",
      "Linked contact, property or opportunity must be within reach",
      "Only documents the user can see, including sensitivity rules",
    ],
  },
  "documents.manage_shared": {
    allows: "Add and remove shared files: documents the whole organization can open.",
    conditions: [
      "Administrators have it by default",
      "PDF, JPEG or PNG, up to 15 MB",
      "Shared files cannot be linked to a contact, property or opportunity",
    ],
  },
  "documents.archive": {
    allows: "Open Archive, archive documents and restore archived documents.",
    conditions: [
      'Also needs "View documents"',
      "Can be granted or removed for a role or an individual user",
      'Does not need "Manage documents" or an administrator role',
      "Shared files stay within the user's organization; other documents still follow data access and sensitivity rules",
      "Without it, Archive and Restore are hidden and archived files cannot be opened or downloaded",
      "Archiving clears the matching contact document checklist item; files are kept",
      "Documents of expired leads cannot be restored",
    ],
  },
  "documents.view_sensitive": {
    allows: "See sensitive documents such as contracts, reservations, IDs and income proofs.",
    conditions: [
      'Needs "View documents" too',
      "Still limited to records within the user's data access",
      "Without it, only sensitive documents on opportunities they work on",
      "Sensitive files on contacts alone are hidden without it",
    ],
  },
  "reports.view": {
    allows: "Open Sales, Forecast, Agents and Conversion reports and export them to CSV.",
    conditions: [
      'Does not need "View sales pipeline" or "View contacts & leads"; reports read those records directly',
      "Figures cover records in their data access: own, team or all",
      'Agent list limited to themselves, or their team, unless "See all records"',
      "Super Administrators are never listed as agents",
      "Opportunities of archived contacts are left out of sales and agent figures",
      'Property type filter lists only properties the user has access to, unless they have "Access all properties"',
      "Without it, report pages redirect to Forbidden; CSV export returns Forbidden",
    ],
  },
  "billing.view": {
    allows:
      "See Billing and Payments: each opportunity's bill, payments and balance, and export both to CSV.",
    conditions: [
      "Only opportunities in the user's data access (own, team or all)",
      "Opportunities whose lead contact is archived are hidden",
      'Does not need "View sales pipeline"',
      'Creating bills or recording payments also needs "Manage bills and payments"',
      "Saved bills can be printed without billing management permission",
    ],
  },
  "billing.manage": {
    allows: "Create and edit bills, and record and remove payments.",
    conditions: [
      'Does nothing without "View billing"',
      "Only opportunities in the user's data access",
      "Payment classifications: reservation, monthly amortization or full payment",
      "Payment methods: Cash, Bank transfer, Check or Online",
      "Online payments require a transaction slip in PDF, JPEG or PNG format, up to 15 MB",
      "No payments on lost or cancelled opportunities",
      "A payment cannot exceed the balance; Full payment must cover the whole balance",
      "Bill total must be above ₱0; discount cannot exceed the price",
      "Bill total cannot drop below what is already paid",
      "A won opportunity's net price is locked; reopen it to change",
      "Cannot remove a payment the current Reservation or Won stage depends on",
      'Payments auto-move the stage only with "Move opportunities between stages" too',
    ],
  },
  "settings.view": {
    allows: "Open the Settings overview with organization profile and user and role counts.",
    conditions: [
      "Also controls the Settings link in the main sidebar",
      "Gives no user, role, commission or log management by itself",
      "The Users and Roles cards only link onward if those permissions are held",
      "The Logs figure and Recent activity show only with View logs",
      "The system performance panel shows only with View system performance",
      "Other Settings pages check their own permissions, so they open without this by direct link",
    ],
  },
  "settings.system": {
    allows: "See server CPU, memory, disk and uptime on the Settings overview.",
    conditions: [
      "Also needs View settings, because the panel sits on that page",
      "Shown nowhere else in the app",
    ],
  },
  "users.manage": {
    allows: "Create users and agents, edit roles, team and status, and manage their documents.",
    conditions: [
      "Covers the Users list, user edit page, organization chart, new agent page and user documents",
      "Only users in their own organization; archived users are not listed",
      "Super Administrators are hidden from the list and can't be changed",
      "Can't change a user who has any permission they don't hold",
      "Can only add roles whose permissions they all hold",
      "Can remove a user's roles, if they can change that user",
      "Can't change their own roles or status, or deactivate themselves",
      "Deactivating someone with open work needs a person to take it over",
      "Deactivated users are signed out right away",
      "Accreditation certificates only go on Agent, Broker-type or Master Broker accounts",
      "Changing a user's own permissions also needs Manage roles & permissions",
      "No Settings sidebar link without View settings; pages open by direct link",
    ],
  },
  "users.delete": {
    allows: "Archive users; their records are kept and they can no longer sign in.",
    conditions: [
      "Also needs Manage users",
      "Can't archive themselves",
      "Can't archive a Super Administrator, whoever they are",
      "Can't archive a user who has any permission they don't hold",
      "Open leads, opportunities, team, tasks and upcoming viewings must be handed to someone",
      "The person taking over a team must suit their roles, with no reporting loop",
      "Archived users are signed out immediately",
      "The Archive option only appears with this permission",
    ],
  },
  "users.restore": {
    allows: "See the Archived users page and bring archived users back.",
    conditions: [
      "Also needs Manage users, for both the page and the restore",
      "Can't restore a user who has any permission they don't hold",
      "Super Administrators can't be restored here",
      "Only users from their own organization",
      "The Archived users button on Users shows only with this permission",
    ],
  },
  "roles.manage": {
    allows:
      "Change what each role can do, set role commissions, and change individual users' permissions.",
    conditions: [
      "Covers the Roles & permissions page and the Commissions page",
      "Can't edit the Super Administrator role",
      "Only a Super Administrator can see or edit the Administrator role",
      'Can\'t change a role they hold; it shows as "Your role", read-only',
      "Can't save a role with permissions they don't hold (Super Administrator exempt)",
      "Commission rates and splits must be 0–100%",
      "Per-user changes: not themselves, not a Super Administrator",
      "Per-user changes: not users with access they lack; give only what they hold",
      'Reaching a user\'s permission editor also needs "Manage users"',
    ],
  },
  "settings.audit": {
    allows: "Read the organization's full audit log of changes, with search and filters.",
    conditions: [
      "Shows every change in the organization, not limited by data access",
      "Also adds the log count and Recent activity on the Settings overview",
      "Seeing that overview card also needs View settings",
      "Read-only; entries can't be edited or deleted",
    ],
  },
  "records.view_own": {
    allows: "See only records they own or are assigned to.",
    conditions: [
      "Same as holding no data access permission: everyone sees at least their own",
      "Team or all records wins if the user also holds either",
      "Covers contacts, opportunities and similar records, each only within their own organization",
      "Records where they are only the broker are not included",
      "Properties follow property access, not this setting",
    ],
  },
  "records.view_team": {
    allows: "See their own records plus records of people who report to them.",
    conditions: [
      "Covers records they own, their direct reports' records, and records naming them broker",
      "Only direct reports; their reports' agents are not included",
      "Archived team members' records stay visible until handed over",
      "Opens the My team page, but only for Broker-type or Master Broker roles",
      "See all records wins if the user also holds it",
      "Calendar events, viewings and dashboard tasks still show only their own",
      "Gives no broker reassignment or assigning viewings to others",
    ],
  },
  "records.view_all": {
    allows:
      "See every record in the organization, plus organization-wide calendar, reports and dashboards.",
    conditions: [
      "Covers the whole organization, never other organizations",
      "All calendar events, all viewings and all tasks on the dashboard",
      "Reports and dashboard figures cover all users",
      "With Manage calendar: edit any viewing and assign viewings to other agents",
      "With Reassign broker: required to reassign contacts' brokers",
      "Overriding the lock on won sales still needs Super Administrator",
      "With Archive contacts: restore any archived contact",
      "Opens My team only for Broker-type or Master Broker roles",
      'Properties and units still follow property access, unless the user has "Access all properties"',
    ],
  },
} satisfies Record<PermissionKey, PermissionDetail>;
