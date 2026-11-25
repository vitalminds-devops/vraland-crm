---
paths:
  - "app/**/*.tsx"
  - "src/components/**"
  - "src/features/*/components/**"
---

# UI rules

## Design approach (always)

Design as a senior UX/UI designer would. Ask first what is easiest for the person using it.

- Every screen must look professional and clean: consistent spacing, alignment and sizes, the same style for the same kind of control, and no leftover clutter.

- One clear main action per screen. Put rarely used actions in a menu (for example ⋯ More).
- Keep screens organized and uncluttered: group related things and leave space between groups. Remove what does not help the task.
- Use patterns people already know. On phones, always use the common mobile app design:
  - Top bar: ← back arrow on detail pages (`BackButton` does this), the page title, at most one page action. No sign-out or theme buttons there.
  - Bottom tab bar for the main sections (Dashboard, Contacts, Pipeline, Tasks) and More, which opens a sheet with the profile card and every other section as a grouped list.
  - Lists: search with a filter icon, filters in a bottom sheet, rows without a table header, and a round + button for the main create action (smaller round buttons above it for extra actions).
  - Forms: one column, Cancel and Save pinned above the tab bar.
  - Keep fixed or sticky bottom elements above the tab bar (`calc(3.5rem + env(safe-area-inset-bottom))`).
- Hide options until they are needed (filters, extra columns), and show when one is active (for example "Filters 2").
- Make every screen flexible and responsive on any device (phone, tablet, laptop, wide desktop) so it stays user friendly and easy to use. No sideways scrolling, nothing cut off, and touch targets big enough for a finger.
- Check every screen at phone (390px) and desktop widths before calling it done.
- Use the impeccable skill (`/impeccable`) for design work: polish, adapt, layout and critique.

## One look for every page (always)

The property **Access** page sets the look. Every detail and settings page must match it, so the app reads as one product. When you touch a page that doesn't match, bring it in line.

- **Header:** `PageHeader` carries the record's name as the title, a short description (status · code), and every page action, with the main action first and Back last. Don't add a second header row or repeat the title as a big heading in the page.
- **Cards:** build sections with `Panel` (`@/components/ui/panel`): one `rounded-xl border-border/60 bg-card`, a slim header (14px semibold title, a muted 12px count such as "10 floors · 99 units" or small actions on the right), and the body below.
- **No cards inside cards.** Split a panel into panes with dividers (`border-r` / `border-b border-border/60`), like the Access page's people list and Give access form. Media (a 3D view, a photo, a plan) may keep its own frame.
- **Lists and figures:** rows divided by `divide-border/40`; key figures as a divided strip in the panel (label 12.5px muted, value 18px semibold), not boxed tiles.
- **Text sizes:** 14px panel titles, 13px body, 12–12.5px muted hints and counts. Use `text-primary` only for links, the selected item and the main button, never for plain figures.
- **Spacing:** 16px (`p-4`) inside panels, 16px (`space-y-4`) between them.
- **Empty states:** a short muted line in the panel body ("No one has access yet."), centred when it's the panel's only content.

## Pages (`app/(crm)/**/page.tsx`)

- Start with `await requirePagePermission("<area>.view")`.
- Parse `searchParams` into safe values: clamp the page number, check the page size against an allow-list, and check the sort with `isXSortKey`.
- Load data with `Promise.all` over the feature's queries, then render `PageContainer`, `PageHeader` and the feature components.
- No business logic or SQL in the page.

## Components

- Server components by default. Add `"use client"` only for state, effects or event handlers, and keep that boundary as low in the tree as possible.
- Mutations call the feature's server action and show the result with `notify(...)` (toast). On success, call `router.refresh()` or rely on the action's `revalidatePath`.
- Forms use react-hook-form with the feature's zod schema from `schemas/` (the same one the action uses), laid out with `form-kit` (`FormSection`, `FormField`, sticky `formActionsClass`).
- Use the UI kit (`@/components/ui/*`) before raw HTML, and lucide-react for icons.
- No `setState` inside `useEffect`; the lint rule forbids it. Derive the value, or set a ref.

## Wording (keep it consistent)

| Say | Not |
|---|---|
| Contact | client, buyer, lead (as a column or label for a person) |
| Agent | assigned agent, owner, assigned to, responsible agent |
| Property / Properties | inventory, building |
| Invoice no. | invoice, reference |
| Won | closed, closed-won |
| Lead, Opportunity, … | stage names, only when you mean the stage |
| Unit identifier | numbering, unit number, unit code |
| Section | floor group, wing, zone |

- The full list of terms is in `docs/wording.md`; use it for every new label, button, toast and permission.
- One word per idea across the whole system. Never call the same thing by two names (for example Identifier in one place and Numbering in another). When the user renames a term, change it everywhere users read it in the same change (labels, tabs, dialog titles, toasts, errors, aria labels, CSV headers, permissions, `CHANGELOG.md`), add it to `docs/wording.md` with the old word under Not, then grep for the old word before calling it done.
- Sentence case for labels and headings ("Gross list price", not "Gross List Price").
- Keep UI text short: a few words. No explanations in dialogs, headers or hints.
- Buttons say exactly what they do ("Send now", "Turn off"). Toasts confirm it ("Turned off.").
