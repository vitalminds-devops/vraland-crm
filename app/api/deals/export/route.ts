import { dealLabel } from "@/features/deals/lib/deal-label";
import { listDeals } from "@/features/deals/queries/deal.queries";
import { csvResponse, limitNote } from "@/lib/http/csv";
import { getAuthorizationContext } from "@/lib/permissions/authorization";
import { hasPermission } from "@/lib/permissions/policy";
import { manilaDate } from "@/lib/utils/manila-time";

// shortcut: one page of 10,000 deals; the file ends with a note when cut off.
const EXPORT_LIMIT = 10_000;

/** The opportunity list under the page's search, stage and status filters. */
export async function GET(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) return new Response("Authentication is required", { status: 401 });
  if (!hasPermission(context, "deals.view")) return new Response("Forbidden", { status: 403 });

  const params = new URL(request.url).searchParams;
  const data = await listDeals({
    page: 1,
    pageSize: EXPORT_LIMIT,
    search: params.get("search") || undefined,
    stage: params.get("stage") || undefined,
    status: params.get("status") || undefined,
  });

  return csvResponse(
    [
      [
        "Code",
        "Opportunity",
        "Stage",
        "Status",
        "Type",
        "Value",
        "Currency",
        "Probability %",
        "Agent",
        "Expected close",
      ],
      ...data.rows.map((deal) => [
        deal.code,
        dealLabel(deal),
        deal.stageName,
        deal.status,
        deal.dealType,
        deal.amount,
        deal.currency,
        deal.probability,
        [deal.agentFirstName, deal.agentLastName].filter(Boolean).join(" "),
        deal.expectedCloseDate,
      ]),
      ...limitNote(data.rows.length, EXPORT_LIMIT),
    ],
    `vra-opportunities-${manilaDate()}.csv`,
  );
}
