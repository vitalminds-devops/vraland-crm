---
paths:
  - "app/**/*.tsx"
  - "src/components/**"
  - "src/features/*/components/**"
---

# UI rules

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

- The full list of terms is in `docs/wording.md`; use it for every new label, button, toast and permission.
- Sentence case for labels and headings ("Gross list price", not "Gross List Price").
- Keep UI text short: a few words. No explanations in dialogs, headers or hints.
- Buttons say exactly what they do ("Send now", "Turn off"). Toasts confirm it ("Turned off.").
