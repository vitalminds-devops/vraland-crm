import { listPayments } from "@/features/billing/queries/billing.queries";
import {
  paymentClassificationLabels,
  paymentMethodLabels,
} from "@/features/billing/schemas/billing.schema";
import { formatContactName } from "@/features/contacts/lib/helpers";
import { csvResponse, limitNote } from "@/lib/http/csv";
import { getAuthorizationContext } from "@/lib/permissions/authorization";
import { canViewBilling } from "@/lib/permissions/policy";
import { manilaDate } from "@/lib/utils/manila-time";

// shortcut: one page of 10,000 payments; the file ends with a note when cut off.
const EXPORT_LIMIT = 10_000;

/** Every recorded payment matching the page's search, newest first. */
export async function GET(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) return new Response("Authentication is required", { status: 401 });
  if (!canViewBilling(context)) return new Response("Forbidden", { status: 403 });

  const search = new URL(request.url).searchParams.get("search") || undefined;
  const data = await listPayments({ page: 1, pageSize: EXPORT_LIMIT, search });

  return csvResponse(
    [
      [
        "Date paid",
        "Opportunity",
        "Contact",
        "Broker",
        "Unit",
        "Type",
        "Method",
        "Invoice no.",
        "Amount (PHP)",
      ],
      ...data.rows.map((row) => [
        row.paidOn,
        row.dealCode,
        row.firstName
          ? formatContactName({ firstName: row.firstName, lastName: row.lastName ?? "" })
          : null,
        [row.brokerFirstName, row.brokerLastName].filter(Boolean).join(" "),
        row.unitLabel,
        paymentClassificationLabels[
          row.classification as keyof typeof paymentClassificationLabels
        ] ?? row.classification,
        paymentMethodLabels[row.method as keyof typeof paymentMethodLabels] ?? row.method,
        row.referenceNo,
        row.amount,
      ]),
      ...limitNote(data.rows.length, EXPORT_LIMIT),
    ],
    `vra-payments-${manilaDate()}.csv`,
  );
}
