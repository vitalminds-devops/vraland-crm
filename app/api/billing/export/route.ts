import { billStatusBadge } from "@/features/billing/lib/format";
import {
  billStatuses,
  listBilling,
  type BillStatus,
} from "@/features/billing/queries/billing.queries";
import { formatContactName } from "@/features/contacts/lib/helpers";
import { csvResponse, limitNote } from "@/lib/http/csv";
import { getAuthorizationContext } from "@/lib/permissions/authorization";
import { canViewBilling } from "@/lib/permissions/policy";
import { manilaDate } from "@/lib/utils/manila-time";

// shortcut: one page of 10,000 opportunities; the file ends with a note when cut off.
const EXPORT_LIMIT = 10_000;

/** The billing list under the page's search and status filter. */
export async function GET(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) return new Response("Authentication is required", { status: 401 });
  if (!canViewBilling(context)) return new Response("Forbidden", { status: 403 });

  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const data = await listBilling({
    page: 1,
    pageSize: EXPORT_LIMIT,
    search: params.get("search") || undefined,
    status: (billStatuses as readonly string[]).includes(status ?? "")
      ? (status as BillStatus)
      : undefined,
  });

  return csvResponse(
    [
      [
        "Opportunity",
        "Contact",
        "Stage",
        "Broker",
        "Property / unit",
        "Bill total (PHP)",
        "Paid (PHP)",
        "Balance (PHP)",
        "Status",
      ],
      ...data.rows.map((row) => [
        row.dealCode,
        row.contactId
          ? formatContactName({ firstName: row.firstName ?? "", lastName: row.lastName ?? "" })
          : row.title,
        row.stageName,
        [row.brokerFirstName, row.brokerLastName].filter(Boolean).join(" "),
        row.unitLabel ?? [row.unitCode, row.developmentName].filter(Boolean).join(" · "),
        row.total,
        row.total === null ? null : row.paid,
        row.total === null ? null : Math.max(0, Number(row.total) - Number(row.paid)),
        billStatusBadge[row.status as BillStatus]?.label ?? row.status,
      ]),
      ...limitNote(data.rows.length, EXPORT_LIMIT),
    ],
    `vra-billing-${manilaDate()}.csv`,
  );
}
