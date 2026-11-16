import { label } from "@/features/properties";
import {
  PROPERTY_EXPORT_LIMIT,
  exportPropertyUnits,
} from "@/features/properties/queries/property.queries";
import { csvResponse, limitNote } from "@/lib/http/csv";
import { getAuthorizationContext } from "@/lib/permissions/authorization";
import { hasPermission } from "@/lib/permissions/policy";
import { manilaDate } from "@/lib/utils/manila-time";

/** Every unit the user may see, with its property, under the list's search, status and type. */
export async function GET(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) return new Response("Authentication is required", { status: 401 });
  if (!hasPermission(context, "properties.view")) return new Response("Forbidden", { status: 403 });

  const params = new URL(request.url).searchParams;
  const rows = await exportPropertyUnits({
    search: params.get("search") || undefined,
    status: params.get("status") || undefined,
    type: params.get("type") || undefined,
  });

  return csvResponse(
    [
      [
        "Property code",
        "Property",
        "Development",
        "Type",
        "Listing",
        "Property status",
        "City",
        "Province",
        "Asking price",
        "Monthly rent",
        "Currency",
        "Floor",
        "Unit",
        "Unit status",
      ],
      ...rows.map((row) => [
        row.code,
        row.title,
        row.developmentName,
        label(row.type),
        row.listingType && label(row.listingType),
        label(row.status),
        row.city,
        row.province,
        row.askingPrice,
        row.monthlyRent,
        row.currency,
        row.floorLabel,
        row.unitCode,
        row.unitStatus && label(row.unitStatus),
      ]),
      ...limitNote(rows.length, PROPERTY_EXPORT_LIMIT),
    ],
    `vra-properties-${manilaDate()}.csv`,
  );
}
