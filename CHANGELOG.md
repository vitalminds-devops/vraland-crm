# Changelog

All notable changes to this project are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- The contact form asks for the last name first, then first name and middle name, as Billing's applicant details do.
- Sections are called sections in the code too, not floor groups; nothing changes on screen.
- Unit identifiers are called identifiers in the code, not numbering or code; nothing changes on screen.
- Parking slots, a property's parking slot limit, and a development's properties use those names in the code too; nothing changes on screen or in the API.
- Moving an opportunity between stages is split into smaller steps in the code; it works the same.
- The dashboard's data loads in four parts (contacts, sales, work, inventory) in the code; it shows the same figures.
- Move to Opportunity and Change units check the user's permission before anything else, and their reads and form rules live in their own files; they work the same.
- Saving a bill and recording a payment give each refusal's message where the rule is checked; the messages are unchanged.

## [0.8.0] - 2026-11-27

### Changed
- Editing a contact no longer requires the agent, budget range, province, city or barangay. Leaving the agent blank keeps the current one.
- Billing and Move to Opportunity change the stage under the permission they already checked, instead of checking it a second time.
- Dashboard amounts drop a trailing ".0" (₱9M instead of ₱9.0M), as property tags do, and a contact's annual income keeps its centavos.
- Units and parking slots are treated as reserved or sold out by one shared rule everywhere.
- When another opportunity has reserved a unit or parking slot, Billing names every one taken, as the pipeline does, instead of only the first.
- Who can see which contacts and opportunities is decided by one shared rule in every list, report and export.
- Opportunities read their units from one list everywhere; older opportunities with a single unit are moved onto that list. Run `npm run db:migrate` (migration 0085).
- An opportunity's parking amount shows whenever it has parking slots listed, going by the list itself rather than a separately stored count.
- A bill's summed label and price are named for what they are in the code (items label and total); nothing changes on screen.
- A unit's, floor's and parking slot's property is called the property in the code too, not the building. A Move to Opportunity form left half-filled before this update starts fresh.
- The Agent on a contact or opportunity has one name in the code instead of five; tasks keep their Assignee. Nothing changes on screen or in CSV files.

### Fixed
- The sign-in page fits phones: the form scrolls with the page, "Remember me" stays a square checkbox, and its links stay on one line with finger-sized tap targets.

### Removed
- Retired database columns nothing used: an opportunity's old reservation-fee paid date and payer, and the unused password field on users. Run `npm run db:migrate` (migration 0081).
- Twelve property columns left from the old property form (property-wide prices and fees, commission rate, lot area, bedrooms, bathrooms, purchase type, cover image). Prices live on unit types, parking types and slots. Run `npm run db:migrate` (migration 0082).
- The empty Offers card on opportunities, and the unused offers, property media, e-sign and contact category tables. A table that still holds rows is kept, so no record is lost. Run `npm run db:migrate` (migration 0083).
- Fields nothing ever filled in: a property's own floor area (no longer shown on bills), a development's map position, an opportunity's financing type and agent split, a contact's last-contacted date, calendar and e-sign provider ids, and the organization's street address. A column that holds any value is kept. Run `npm run db:migrate` (migration 0084).

### Security
- Email and lead-expiry logs go through the app logger, and email logs no longer record the recipient's address.

## [0.7.1] - 2026-11-26

### Fixed
- Billing totals and payment checks use the same bill-scoped payment sums, keeping payment IDs from being mistaken for bill IDs.
- Missing reservation and first monthly payments are identified by a code instead of message wording, keeping pipeline hints and payment-recording guidance consistent when messages change.
- Property links on the calendar, viewings, tasks and document pages opened a missing page; they now open the property.
- The properties CSV export shows unit status as Reserved and Sold out, as the app does, instead of "Deposit paid" and "Sold".
- The opportunities CSV export and the opportunity list show status and type as words (Open, Won, Sale) instead of raw values.
- Contacts saved with an older stage (lead, prospect, past client) show as Active or Inactive instead of the raw value, on the list and in the contacts CSV.
- "Deal" no longer appears in the app: the contact form step, follow-up trigger, user handover prompt and several messages say Opportunity.
- Client, buyer and customer now read Contact: the contacts page description, the bill's Contact section, the contact detail's Property interest heading, loss-reason examples and several messages.
- Building, inventory, parking spaces and access grant now read property, units, parking slots and Property access in messages, Logs and the opportunity checklist.
- The contacts table, permission help and the dashboard say Agent and "Your records" instead of "Assigned agent" and "assigned to you".
- A property's and an opportunity's sale, rent or lease field is called Offer type everywhere: the property and contact forms, the contact and opportunity pages, and both CSV exports (was Transaction type, Listing and Type).
- About 90 error messages and page error headings now read "Couldn't …" (for example "Couldn't save the task."), as the rest of the app does, instead of "… could not be saved" or "Failed to …".

## [0.7.0] - 2026-11-26

### Added
- A unit's Price & type dialog shows "Billed at ₱X" when an open opportunity's bill holds a different price for it (for users who can see Billing).

### Changed
- A reserved or sold unit or parking slot keeps the price on its bill: its price field in Properties is greyed out with "Price is on the bill.", and the price can only be changed in Billing.
- A won opportunity's commission is set once, at the price it was sold for: reopening it, changing the price in Billing and winning it again keeps the same commission. It is dropped only if the opportunity ends Lost or Cancelled, and saving the contact meanwhile can't change it. While reopened, the opportunity page still lists it, marked "From the first win".
- Marking an opportunity Lost, from the pipeline board or the opportunity page, asks for a loss reason (and optional notes), so Lost analysis groups by real reasons. Every organization without loss reasons gets a starter list (migration 0078), and new organizations start with it.
- On Settings → Roles and a user's Permissions, a dashboard panel can only be ticked when the role can open the module it shows: without it, the panel is greyed out with "Needs View sales pipeline" (or similar), and unticking a module unticks its panels.

### Fixed
- Changing a unit type's price, or giving a reserved or sold unit another type (in unit details or on the Design page), no longer changes that unit's price; it keeps the price it was sold at.
- Changing an opportunity's units no longer reprices a unit already on its bill after the unit is renamed or its bill line is relabelled.
- A stale tab can no longer move a lead whose contact was archived meanwhile, or change units on an opportunity that went back to Leads; both now say what happened.
- Moving to Opportunity (including an approved request or reopening a Lost one) refuses units or parking another opportunity has reserved since, naming them, instead of landing on a unit already held elsewhere. Going back to Leads also clears the old amount, so the lead's card and pipeline totals stop showing the released units' price.
- Deleting an opportunity updates the dashboard and Billing right away.
- A Cancelled opportunity reopens only to Leads or Opportunity, like a Lost one, so it can't skip the payment gates straight to Reservation or Won. Deleted opportunities no longer keep a retired Cancelled stage active.
- Move to Opportunity checks that you're allowed to move the lead (for example, a broker who isn't its broker) before saving anything, instead of saving the details, documents and units and then refusing the move.
- Reopening a Lost opportunity clears its loss reason and notes, so an open or Won opportunity no longer shows why it was once lost.
- Removing a payment cancels a move to Won or Reservation that was waiting for approval on it, instead of leaving a request that can no longer be approved.
- Won and lost counts on the dashboard (this month and the win rate) and Lost analysis include opportunities whose contact is archived, so expired leads count as lost and archiving a contact no longer rewrites past months.
- Lead expiry skips leads with a move waiting for approval, so a later approval can't reopen an expired lead. An expired lead now shows in the opportunity's activity and is filed under the loss reason "Client unresponsive" when the organization has it.
- Reassigning an opportunity's agent also moves it to the new agent's broker, so that broker can see and move it and earns on it. On a Won opportunity the commission shares move to the new agent and broker as they were won, instead of being recomputed at today's rates.
- Changing an opportunity's units keeps the billed price of units and parking it already holds, even if their list price changed since; only new picks take today's price. Saving Change units without changing anything no longer re-quotes the reservation fee and amortization at today's amounts.
- Removing a payment can no longer strand an opportunity: in Won, neither the reservation nor the first monthly payment it stands on can be removed, and a Reserved or Won opportunity always keeps some reservation money. Move it back a stage first.
- A lead that goes back to Opportunity with different units gets its bill rebuilt for the new pick, the same as Change units, instead of keeping the old units and price.
- Reopening a Lost opportunity to Opportunity works again: it asks for a reason like other moves back, instead of opening the Move to Opportunity form, which always refused it. A lead lost before reaching Opportunity is told to reopen to Leads first.
- An opportunity with any payment can't be marked Lost (or Cancelled) until its payments are removed in Billing, so paid-for units are never put back on sale while the money is still recorded. This includes Won opportunities that aren't fully paid.
- Moving an opportunity back to Leads lets go of its units, parking and quoted fees (they go back on sale), and its history says which. An opportunity with payments can't move back to Leads until they're removed in Billing, so paid-for units are never left held by an opportunity that no longer lists them. Move to Opportunity then starts from a clean pick: earlier picks that were taken since (from the opportunity, the contact's preferences or this browser's draft) are removed with a short note, instead of blocking the move.
- Move to Opportunity no longer hides why it can't continue: the unit count says how many picks aren't on the floor shown ("5 units selected · 3 not on this floor"), the message says how many are no longer available or shared with you, and Remove them drops just those, keeping the rest.
- The dashboard's money strip no longer leaves an empty grey block when a role sees only one or four figures; the figures fill the row.
- A floor's or unit's size can no longer be set smaller than what's drawn on it, so a mistyped number (such as 6 on the way to 66) no longer squashes the whole design. Growing it is unchanged.

## [0.6.0] - 2026-11-25

### Added
- An "Export opportunities" permission for the Opportunity list's CSV, like Export contacts. Every role that can view opportunities keeps it (migration 0077); without it, the Export button is hidden.
- "Access all properties" and "Manage shared files" permissions. Administrators had both by role; they keep them (migration 0076), and unticking them now works. Giving property access no longer skips its permission for Administrators.
- Custom roles with "Move opportunities between stages" can move opportunities: like an Agent with own records, a Broker with team records, a Sales Manager with all records. Built-in roles move as before.
- A "Manage prices" permission for prices, reservation fees and monthly amortization on unit types, parking types, units and parking slots. Every role with "Design properties" keeps it (migration 0074); without it, types can still be designed and renamed, and prices and fees show but can't be edited.
- In Design floor and Design unit, pick several pieces with Shift or Ctrl + click, or Shift + drag a box (Ctrl+A picks all), then move, duplicate, copy (Ctrl+C, Ctrl+V) or remove them together.
- A unit on Design floor can be resized from its corner; its rooms stretch to fit, while its unit type, area and price stay the same.
- The Identifier window also names parking: across the whole property (P1, P2, P3) or by floor like the units (P2A, P2B or P201, P202). New slots follow it, and saving renames this floor's slots, or every floor's when "Apply to every floor" is ticked.

### Changed
- The Properties list is tidier: filters sit in a grid on tablets, rows breathe more, and granted access reads "of 12 units" with the floors underneath.
- On the 3D floor view, each parking slot shows a small chip with its identifier, coloured by its status, in place of the painted number.
- `db:sync-permissions` also refreshes permission descriptions from the catalog and lists keys the catalog no longer has; run it after `db:migrate` (now in the README).
- Permission names and descriptions follow the wording guide ("Give property access", opportunities, expected close, property access instead of grants), say what else each one needs, and "See own records" shows as always on. Some opportunity errors now say contact and property instead of client and building.
- The "Manage floors, units and parking" permission is now called "Design properties" and says what it covers: the Design page with unit and parking types, floors and floor plans, sections, unit identifiers, units and parking. "Edit properties" no longer mentions prices, which are set with "Manage prices".
- "View billing" opens Payments too, read-only: brokers can see and export the payments on their opportunities, and the dashboard's payment figures no longer lead them to Forbidden. Recording and removing payments still need "Manage bills and payments".
- The dashboard shows Reservations received this month (reservation payments since the 1st, with how many) in place of Reservation value, and no longer shows Open opportunities. The Summary leaves out Viewings scheduled while Upcoming tasks & viewings already lists them.
- Wording follows the guide in a few more places: the dashboard's availability panel is called Properties, the parking window says "Parking slot P1" and "Remove slot", the contact form's error reads "Review the highlighted fields below.", and the billing and payments CSV money columns say "(PHP)".
- If properties, floors or units can't load in the unit picker, a message says so instead of the list just staying empty.
- Design floor works like Figma: Assets and Layers on the left, the plan in the middle, and a Properties panel on the right (identifier, unit or parking type, X, Y, W, H, rotate, flip, duplicate, remove; with nothing picked, the floor size, identifier and copying to other floors). Double-click a unit, or use Edit rooms, to edit its unit type's rooms right there; saving it updates every unit of that type. New unit types can be added from Assets.
- Design unit uses the same layout, and rooms can now be flipped (Flip or F), such as a door swinging the other way.
- A picked piece in Design floor and Design unit stands out clearly: tinted, with a solid outline and halo drawn over its neighbours.
- On the Design page's 3D view, pointing at a unit no longer swaps its chip for the large tag (identifier, section, status); only its wall sizes show.
- "Apply to every floor" in the Identifier window starts unticked, so saving changes only the floor you're designing unless you tick it.
- In Design floor and Design unit, a picked piece has a Duplicate button (also Ctrl+D): the copy is the same size and sits right beside the original instead of overlapping it, and a copied parking slot or unit gets its own identifier.

### Fixed
- A development's page shows Edit only on the properties you can actually save, instead of opening an edit page that then refuses.
- On Settings → Roles and a user's Permissions, Manage users, Delete and Restore users and Manage roles are listed under Settings instead of as separate "users" and "roles" groups at the bottom.
- Broker-type roles (License Broker, Network Partner, Sales Executive, Sales Director, Consultant) can invite others to events on older databases too, as on new ones (migration 0075).
- The floor menu has a Rename item for the current floor, so floors can be renamed from the keyboard or a screen reader. Windows such as Design floor, Identifier and Price & type no longer log a missing-description warning.
- A broken property link in floor setup (or any property change) shows a message instead of an error page.
- Units renamed in Design floor or with "Apply to every floor" get a "Unit 301 was renamed to 310" entry in their history, like a single rename.
- The dashboard's Floors count only counts the floors an agent has access to, like the units and parking beside it.
- When only parking sets a reservation fee, the unit reservation fee shows "—" instead of ₱0.00 on the bill and in the opportunity windows.
- Saving two floors of a property at the same time no longer gives two new parking slots the same identifier, and swapping two slots' identifiers in one save works. A clash between slot names now says "Two parking slots would share an identifier" instead of talking about units.
- Renaming units and copying the floor in the same save gives the copies the new identifiers (301 renamed to 310 becomes 510 on the 5th floor, not 501).
- Record payment refills the amount when you change the payment type or the bill, and clears a suggestion that no longer applies, such as the reservation fee left after switching to Monthly. An amount you typed yourself is kept.
- Roles that can see dashboard figures but not Summary see Active contacts again, in the key figures.
- In the full-screen floor view, windows and menus opened from a unit (View photos, Add photo, Price & type, Rename) show on top instead of hidden behind it.
- In the opportunity windows, parking with no floor can be picked again (listed under the chosen floor's parking). The selected count, Clear parking selection and the "no longer available" warning show even on a floor without parking, and slots chosen on another floor are named ("P5 on another floor").
- A suggested bill's parking lines add up to the parking amount quoted on the opportunity, even if a parking price changed since. Very old opportunities with a parking amount but no slots listed get one "Parking (2 slots)" line instead of none.
- A unit or parking slot with a reservation payment stays Reserved when units or parking are added to the opportunity afterwards, even though the reservation fee due goes up. Before, it went back to Available.
- Copying a floor's layout to other floors keeps the parking slots already on them, by position, with their identifiers, prices and fees, instead of removing and re-adding them (and no longer stops when one of them is reserved). Only extra or missing slots are added or removed.

### Security
- Recent activity on the dashboard shows only activity from modules the user can open, so someone without Documents or Tasks no longer sees those entries.
- Dashboard panels follow each panel permission even on a database whose permissions haven't been synced yet, instead of showing every panel to everyone.
- Editing a role can no longer take away permissions the editor doesn't hold themselves (Super Administrators excepted), and the role's history now records which permissions it had before and after.
- Changing an opportunity's units, which re-totals its bill, needs "Edit opportunities" as well as "Move opportunities between stages". Agents and brokers have both by default.
- Changing a property (its details, floors, units, parking, types or design) needs access to the whole property. Someone given only some floors or units can still see them, but can no longer rename, re-price or remove anything in that property. Administrators are unaffected.
- Roles without "View billing" (Agent and Sales Manager by default) no longer see the money collected under Won sales value on the dashboard.
- "View sensitive documents" now decides on its own who reads contracts, IDs and income proofs. Sales Manager and Administrators used to see them whatever the setting; they keep the permission (migration 0073), and unticking it on a role or user now works.

## [0.5.1] - 2026-11-25

### Changed
- The dashboard's Won sales & forecast chart has its own legend, and a user's profile details in Settings are easier to read.

### Fixed
- Sizes in Design unit and Design floor can be typed normally: typing 12 no longer jumps to 2 on the first digit. A size below the minimum or not a number settles when you leave the field.
- Sections made from old odd and even side names (such as Sunrise) can be saved again.
- A unit type can't be removed while units use it ("12 units use 2BR. Remove them in Design floor or give them another type first."), instead of leaving those units with no price or size and their floors unable to save.

## [0.5.0] - 2026-11-25

### Added
- Dashboard card for Available parking (free slots, of all the slots you can see).
- Dashboard cards for Won (value, with the count and amount collected underneath), Monthly paid (amount, with the number of payments) and Floors (with how many properties have them). Total reservations now leads with its amount, the count underneath.
- Design floor's Identifier can apply to every floor at once, renaming each floor's units in their current order so the whole property reads the same.
- Dashboard cards for Total reservations (opportunities in Reservation, with their total value) and Available units (of all units you can see).
- Parking types: on the Design page, unit and parking types share one list, and Design parking (beside Design unit) sets a slot's name, size, price and reservation fee. In Design floor they sit under Parking, ready to drag; new slots take the type's price and fee, and changing the type updates its slots that are still available.
- Design floor opens full screen with editor controls: Ctrl/⌘ + scroll zooms at the cursor, dragging the empty canvas (or the middle mouse button) pans, Undo and Redo (Ctrl+Z, Ctrl+Shift+Z), Ctrl+D duplicates, and a Fit button. Clicking a unit shows its plan, size, rooms and price; double-clicking zooms to it.
- Remove several: tick units on a floor, or parking slots, and remove them in one go; the list is named after the floor ("Remove units and slots from 2nd Floor") and grouped into Units and Parking. Reserved and sold ones can't be ticked, and nothing is removed if any is on an open opportunity.
- Each property has a Design page, opened from Design in the property's Actions menu, with tabs for Unit types and Floors. Designing units, floors and parking happens there; the property page just shows the property.
- The Design page is for designing only: its floor view has no prices, status counts, Remove several or unit and slot controls. Parking slots can be resized in Design floor and look like the parking lot (asphalt, lines, wheel stop, light) in the floor view.
- Parking slots are only made by dragging them onto a floor in Design floor; the property page has no separate parking list or Add parking. Click a slot in the floor view to see its price, change its status or remove it, like a unit; a floor's header counts its parking, and Remove several covers its units and slots. Slots on no floor keep a small "Parking without a floor" list. The Design page no longer has a Parking tab.
- Parking is designed in Design floor, next to the units: a floor can be all units, all parking, or a mix. Its Parking section adds slots, drive paths, ramps and pillars; new slots take the next number (P21, P22…), slots taken off the plan are removed unless reserved, sold or on an open opportunity, and the floor's 3D view shows the slots with their numbers and cars. A parking layout made before this is brought onto the floor's plan, below its units, the next time the floor is designed.
- Sections: on the Design page, name a set of floors (such as Tower A for floors 1–10), or only their odd or even units (Sunset for 201, 203…; Sunrise for 202, 204…), or units picked by their letter or number (Garden for A to F), and give it a colour. Odd and even side names saved before become sections on every floor. Each unit on those floors shows the section's name in that colour on its floor tag, its details, the Access plan and the opportunity unit picker.
- Parking has its own reservation fee. The Design page's Prices sets the unit reservation fee and each slot's starting price and reservation fee; any slot can set its own price and fee from its panel on the floor view. Opportunities add up each slot's own price, and the reservation fee includes each slot's fee.

### Changed
- The unit and parking reservation fees are shown apart: a bill's Quoted prices and fees is a small table of Units, Parking and Total with their price and reservation fee, and Move to Opportunity and Change unit list the unit and parking reservation fees separately.
- Parking is picked with its floor: in Move to Opportunity and Change unit, choosing a floor shows its units and then Parking on this floor, with no separate parking section or floor list. On the Access page, the parking shown is the chosen floor's, with slots on no floor listed last.
- The dashboard is calmer: its money (Open opportunities, Reservation value, Won sales value, Payments received this month, Monthly payments received) is one divided strip with the amount first; units and parking show as availability meters in an Inventory panel with properties, floors and properties by status; Active contacts moved to the Summary; the two charts sit side by side at the end.
- Payments shows Collected, This month, Reservation and Monthly with the amount first and the number of payments underneath; the column reads Date paid. Record payment on Payments fills in the reservation fee still due, one month, or the balance for the picked bill, like on a bill page.
- A bill page (and its printout) shows Quoted prices and fees: Units, Parking, Total, Reservation fee (covering units and parking) and Monthly amortization, instead of the old Parking fee. The unit row reads Units & parking when there is parking.
- The property's Actions menu has one Design property item instead of Design units and Design floors.
- Each unit's tag on the floor view shows its section name, in the section's colour, next to its identifier.
- A bill for an opportunity with no units no longer suggests the property's old asking price; its price starts empty unless the opportunity has an amount.
- The properties CSV has a Unit price column (each unit's own price, else its unit type's) in place of the old Asking price and Monthly rent columns.
- Opportunity cards in Sales pipeline list their parking after their units ("Units 2A · Parking P1, P12").
- An opportunity with an unpriced parking slot names it: "Parking P12 has no price yet."
- On a bill's page, Record payment fills in the amount when you pick what it pays: the reservation fee still due, one month of amortization, or the remaining balance. You can still change it.
- Bills list each parking slot on its own line ("Parking P12 · Tower 2") at its own price, instead of one "Parking (3 slots)" line. Parking carries no miscellaneous fee when a bill is rebuilt, the same as on a new bill.
- Choosing units and parking for an opportunity shows each one's price on its chip; hovering shows its unit type or parking type, full price and reservation fee.
- The expected amount in Move to Opportunity lists each unit and parking slot with its price, then the reservation fee and monthly amortization the opportunity will be quoted; Change unit shows both fees under the new total.
- The expected amount warns when a chosen unit's type has no reservation fee ("Unit 2A has no reservation fee."), in Move to Opportunity and Change unit.
- In the unit window, View photos sits beside Hide labels on the 3D view, and the bottom bar has Price & type, Rename and Add photo (or Change photo). Remove is no longer there; remove units with Remove several or in Design floor.
- The floor menu shows each floor's sections under its name, in their colours.
- In Design floor, a picked parking slot has a Type picker: any slot, old or new, can join a parking type (taking its size, and its price and fee while available) or leave it.
- Changing a parking type's size resizes its slots on every floor, in the floor view and Design floor, like unit types do.
- A unit's reservation fee and monthly amortization come only from its unit type; the old property-wide amounts are no longer used. A unit without a type has none, so any reservation or monthly payment opens its stage.
- Wording is the same across the app: "opportunity" instead of "deal", "contact" instead of "client", "Won sales" instead of "Closed sales", "Development" instead of "Project", "Photo" instead of "Picture", "Add …" instead of "New …", "Couldn't" in error messages, the "…" ellipsis, sentence-case labels, "Nov 20" dates, 12-hour times and readable viewing statuses ("No-show"). CSV exports use "Opportunity", "Date paid", "Assignee" and "Follow-up". Permissions read "Contact documents", "Add tasks" and "Manage unit photos".
- Unit identifiers (letters, numbers or custom) are set with an Identifier button in Design floor's header. Its examples use the floor being designed, and saving applies it to that floor's units on the plan (save the floor to keep them); sections have their own tab on the Design page, beside Unit types and Floors.
- Design floor no longer shows a details card when a unit is picked; double-click still zooms to it.
- The Design page no longer has a Prices panel: unit types, parking types and each parking slot carry their own price and fees. Amounts set on the property before are copied down to whatever had none.
- The property form no longer asks for a currency; new properties are in Philippine pesos.
- Designing a unit has Undo and Redo (Ctrl+Z, Ctrl+Shift+Z), like Design floor.
- The property form has three sections, Basics, Location and More details, with section numbers styled like the contact form.
- Designing a unit opens full screen, and each unit type can set its own reservation fee and monthly amortization. Billing, the reservation gate and the unit window use the type's amounts, else the property's.
- Clicking a unit on the floor view opens it in a window: its design in 3D, which you can turn and zoom, beside its type, size, rooms, price, reservation fee and status, with photos, Price & type, Rename and Remove. Parking slots open the same way: the bay in 3D (with its car when reserved or sold), its size, price, reservation fee, status, its own prices and Remove.
- Unit identifiers, reservation fee and parking price are no longer on the property form; they are set in Design. In Design floor, select a unit or parking slot to rename it; the name is saved with the floor.
- The floor switcher over the floor view lists each floor with its unit count and scrolls for long lists; each floor has a quick Rename that opens a small form, and Add floors takes names separated by commas ("Ground, Mezzanine, Roof deck"). A property with no floors shows "No floors yet" with Set up floors, and the empty "Parking without a floor" panel is gone.
- On phones, Contacts has a round Add button with a smaller round More button above it (Archived, Import CSV, Export), and filters that open in a bottom sheet.
- On phones, the contact form keeps Cancel and Save at the bottom of the screen and spaces fields more tightly.
- On phones, list pages show "Page 2 of 5" with previous and next buttons on one line, and no page controls when there is only one page.
- On phones, a bottom tab bar opens Dashboard, Contacts, Pipeline and Tasks; More opens your profile, every other section, Dark mode and Sign out. Detail pages show a back arrow in the top bar.
- On phones, the contact page shows Overview first, and Archived contacts drops the table header and page-size box.
- A property's form no longer has floors. After saving, Design property on the property's page opens its Design page, where you pick the starting and top floor and the floors to skip, with a preview, then design each floor.
- A unit designed in one property can be reused in another: Use a saved design copies its rooms, and you set its name and price there.
- On designed floors, each unit has a small code and status tag just outside its back wall, and hovering or selecting a unit shows its width and depth on its walls. Hide labels hides them all, and the view frames the placed units instead of the whole floor.
- The 3D floor view can be dragged and zoomed like a map, opened in full screen, and has warmer walls, bed throws, rugs and plants.
- Designed floors look like a life-sim game plan: wood, carpet, tile and deck floors per room, navy walls and each room's name painted on it. The area around the building follows the property type: streets and sidewalks for condominiums, offices and commercial; a lawn and a street for houses and townhouses; a yard for warehouses; fields for farms and lots.
- The parking view shows every slot on a floor in one lot, instead of 12 at a time. It stays a straight top view, and a reserved or sold slot's car drives in and parks, painted in its status colour (amber reserved, red sold out).
- The property form no longer has a Features field; features already saved stay on the property. Its More details section is a plain list of fields, and contract dates show only for rent or lease.
- The floors list drops the building picture and is narrower, and the floor view takes the floor's own shape, so units get more of the screen.
- The property page matches the Access page: the name and actions sit in the page header, and each section is one card with a slim header and its counts, split into panes instead of boxes inside boxes.
- On the Access page, "What … may see" drops the building picture and shows floors and units the same way as the property page. Designed floors show their plan: click a unit to give it or hold it back.
- The Floors fields start empty (no ready-made first floor or skipped floor 4), and "First floor" is now "Starting floor".
- Adding or editing a property no longer asks for lot area, floor area, bedrooms or bathrooms; each unit's design sets its size and rooms. The property page stops showing those property-wide figures.
- A balcony can sit outside a unit's walls (up to 2.5 m) in the unit designer; the unit's size and area stay the walled part.
- When a unit type is redesigned to a new size, its units on every floor take the new size in the floor designer, plans and 3D view, instead of being drawn over their old spot.
- Saving a unit type's price applies it to the type's units that are still for sale; reserved and sold units keep their price.
- The floor lists in Floors & units and Parking drop their "Floors" heading, so the list lines up with the floor's title; Add floor sits at the end of the list.
- The property's address and View on map sit on the same row as its actions.
- The property's Actions menu has Edit, Design units, Design floors, Access, Remove several (for the floor shown), History and Archive; Present to client is no longer offered.
- A floor's header shows its name and unit count on one line, with how many units are available, reserved, sold out or inactive in the tags' colours, instead of a colour legend.
- Opening a property shows just its floor view, filling the page like full screen but with the app menu: the floor's name, counts, status, Remove several and the property's address float over its top-left corner, Actions and Back to properties over its top-right, and the floor dropdown sits with Hide labels and Full screen at the bottom right. The Design page keeps its floor list.
- Unit identifier chips and the hover tag keep a fixed size on screen, so they stay readable with the whole floor in view. Hide labels sits beside the full-screen button, and in full screen a floor switcher joins them.
- The floor view is cleaner: each unit has a small number chip in its corner whose dot and border show its status, and the picked unit is outlined; the full tag (side, price, status) appears when you point at or pick a unit, and room names show once you zoom in.
- Unit tags in the floor view show the code, side, price and status at full size instead of squeezed, and room names are quieter so they don't cover the furniture.
- The parking price shows on each parking slot ("Available · ₱10K") and the reservation fee in each unit's details, instead of in the property overview.
- Each unit's price shows on its tag in the floor view ("₱30M") instead of a price range in the property overview.
- "Use a saved design" is gone from Unit types; instead, Copy on a unit type starts a new type from its rooms, size and price. Room names in the unit designer stay upright when a room is turned around.
- The Floors section of the property form shows the side names first and links to the property page instead of a box of buttons.
- Units can have doors: place a Door on any wall in the unit designer and turn it to face the way it opens. Plans draw the door and its swing, and the 3D view opens the wall there.
- The unit designer has new pieces: Study, Laundry, Powder room, Storage and Maid's room.
- Unit types show as cards with their size and price, across the full page width.
- The unit and floor designers fill the screen: the plan fits the space at 100%, the unit shows its outer walls, and room names stay inside small rooms.
- Add floor only asks how many floors; units are added by designing the floor.
- Design a unit by dragging rooms (bedroom, bathroom, kitchen, living, dining, balcony, closet, foyer) onto a grid in metres; its size and bedrooms come from the design, and it gets a price.
- Prices are set per unit (its own price, or its unit type's) instead of one gross list price per property. Opportunities and Billing add up each unit's price, and a unit without a price can't be picked until it has one. Existing units keep their property's old price.
- The property form no longer asks for a gross list price or monthly amortization; the property page shows the range of unit prices. Each unit has a Price & type button.
- Design a floor by dragging designed units, hallways, elevators and stairs onto it. Units are created and numbered as you place them, and the layout can be copied to other floors. Designed floors show in the illustrated top view: each unit is built from its rooms with beds, kitchens, bathrooms and sofas, with a Unit and status label and a status line along its front.
- Property floors and parking show the top-view plan only; the List and 3D views are removed. A floor that isn't designed yet shows only Design floor, instead of the old ready-made studio units and unit cards.
- The Dashboard's "At a glance" panel is now called "Summary".
- Opportunities, contacts, properties and developments get short codes (OPP-000123, CON-000045, PROP-0007, DEV-0003). Existing codes are renumbered, oldest first.

### Fixed
- Picking Full payment in Record payment now shows the filled-in balance in the amount box.
- When changing an opportunity's units, a parking slot it once chose but another opportunity has since reserved no longer shows as available.
- Paying an opportunity's reservation fee reserves its units and parking right away, even while the move to Reservation waits for approval, so no other opportunity can take them.
- An opportunity keeps the reservation fee and monthly amortization it was quoted when its units and parking were chosen; editing a unit type or slot later no longer changes open or won opportunities. Existing opportunities keep today's amounts.
- Saving a parking type no longer overwrites a slot's own price or reservation fee; only slots still on the type's old amount follow the change.
- A unit added in Design floor no longer gets an identifier (such as 101) that another unit on the plan already has.
- "Parking without a floor" shows each slot's own price instead of an old property-wide price.
- Changing a floor's unit identifiers no longer fails when new identifiers swap with existing ones.
- Saving sections no longer fails after one of their floors is removed; the removed floor is dropped from its section.

- A floor opens with no unit picked, instead of the first unit outlined with its tag and wall sizes showing.
- Switching floors is faster: the 3D view stays open between floors and reuses its painted floors, names, tags and shapes instead of rebuilding them, with lighter shadows; "Loading floor…" shows only while it first opens. The full-screen button on the floor view opens it full screen again.
- A removed unit or parking slot also comes off its floor's design, so the plan doesn't keep an empty spot and saving the floor doesn't bring it back.
- Unit codes and room names on floor and unit plans no longer show squashed letters.
- Adding a property opens again instead of showing an error.

## [0.4.6] - 2026-11-21

### Changed
- Billing, opportunity and contact pages fit on phones; the unit picker labels its Property and Floor fields.

## [0.4.5] - 2026-11-21

### Fixed
- An opportunity can't be billed or paid for a unit or parking slot another opportunity already reserved.

## [0.4.4] - 2026-11-21

### Changed
- The sales pipeline says why a stage move is blocked and what to do next.

### Fixed
- Leads stay out of Billing until they reach Opportunity, and cannot be billed or paid before then.
- Monthly payments need the reservation fee paid first and must be at least the monthly amortization.
- Contacts entered by a broker show that broker as the broker with no agent, instead of as the agent with no broker.

## [0.4.3] - 2026-11-21

### Fixed
- Lead cards label the original creator as "Created by" to distinguish them from the assigned agent.

### Changed
- Refined lead-card spacing and text hierarchy, aligned the avatar with the assigned agent, and removed an extra divider.

## [0.4.2] - 2026-11-20

### Added
- Calendar invitations with accept and decline responses, and separate calendar and viewing permissions.

### Changed
- Refined task columns and forms, calendar controls, development lists, user documents and contact form actions.
- Improved opportunity address entry and ID address matching, with clearer reassignment and stage actions.
- Standardized CRM labels and removed the conversion report.
- Server builds install packages with the same npm version used in development.

### Fixed
- Form accent colors no longer override shared button hover colors, and contact form actions no longer cover Notes.
- Calendar month navigation handles month-end dates, and keyboard navigation focuses day cells correctly.
- Improved document replacement handling and contact name formatting.

## [0.4.1] - 2026-11-20

### Fixed
- The server build no longer fails while installing dependencies.

## [0.4.0] - 2026-11-20

### Added
- `deploy.sh` deploys the latest code on the server in one command.

- "Delete developments" now works: an empty development can be deleted from its page.
- "Delete opportunities" now works: an opportunity entered by mistake can be deleted from its page, unless it is Won, has payments, holds units or parking, or is the contact's only opportunity.
- "Reassign agent" on an opportunity's page moves it to another agent, with a reason. On a Won opportunity the commission moves too.

- Bills can be printed as a billing statement with the letterhead, bill items, payment terms, totals and payment history ("Print bill" on a bill's page).
- Documents is now a shared library of forms and templates. Administrators and Super Administrators upload PDF, JPG or PNG files; everyone with "View documents" can open, download or print them.
- A document's page has "Print / Save as PDF" for PDF and image files.
- New permission "Archive documents" opens Archive and archives or restores documents. Migration 0054 gives it to Administrators and Super Administrators.
- Moving a lead to Opportunity now goes in four steps: Documents, Address, Property interest and Unit selection.
- The opportunity form keeps a draft in the browser and reopens where you left off after a reload or a closed tab.
- After an ID is uploaded, its address is read on the device and filled into the Address step for review.
- Payment method can be Bank financing, Pag-IBIG financing, In-house financing or Other.
- Pipeline cards show who entered the lead and the next action.
- The task list shows who created each task and its assignee.
- Saving payments, uploads, photos, developments, account details and opportunities shows a progress message that turns into the result.

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

- A new contact asks only for Details and Deal. Address and property interest are asked when the lead moves to Opportunity.
- Units and parking are held only from the Reservation stage. Selecting them on a lead or an opportunity, even with a payment, leaves them Available.
- Migration 0055 releases units and parking held by opportunities that have no payments and aren't Won.
- Migration 0056 releases units and parking held by leads and opportunities that haven't reached Reservation.
- Dragging an opportunity to Reservation explains that it moves there automatically once the reservation fee is recorded in Billing.
- Online payments need a transaction slip, and only Online payments accept one.
- Archiving and restoring documents needs "Archive documents" instead of "Manage documents". The Archive page lists shared files only.
- Permission names and descriptions use the page and button names users see, for example "View sales pipeline" and "Manage bills and payments".
- Messages appear at the bottom right with a close button and pause while the tab is hidden. Clicking a message no longer closes the dialog behind it.
- Pictures (profile, cover, unit) and contact CSV files are checked before upload, with a clear reason if they're refused.
- Signing in with wrong details says "Invalid email or password".
- Archiving a contact blocked by an opportunity explains why: selected units, parking or recorded payments.
- Properties no longer show how many floors or units are hidden from you. Giving property access keeps your own held-back units held back instead of showing an error.
- Shared files download with their file extension.

### Removed
- Lead source is no longer asked for or shown: it's gone from the contact form, the opportunity page and the report filters, along with the "Conversion by lead source" table and its export.
- Commercial contacts no longer ask "Who is buying?", Owner name or Representative, and the contact page no longer shows Business details. Contact CSV import and export drop those columns.
- Migration 0052 deletes the stored lead sources and the commercial buyer fields from the database.

- The "Approve contacts" and "Manage settings" permissions. Neither ever did anything: contacts are approved automatically, and there are no organization settings to manage.

- Tasks can no longer be linked to a contact, property or opportunity from the task form.
- The All tasks / My tasks switch on the Tasks pages.
- The document type filter on Documents.

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

- A document or requirement upload no longer reports a failure when the file was saved but the page couldn't refresh.
- A picture whose contents can't be read now gets a clear message instead of a generic error.

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
