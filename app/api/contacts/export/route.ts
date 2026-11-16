import { exportContacts } from "@/features/contacts/queries/contact.queries";
import { serializeContactsCsv } from "@/features/contacts/lib/contact-csv";
import { getAuthorizationContext } from "@/lib/permissions/authorization";
import { hasPermission } from "@/lib/permissions/policy";

export async function GET() {
  const context = await getAuthorizationContext();
  if (!context) {
    return new Response("Authentication is required", { status: 401 });
  }
  if (!hasPermission(context, "contacts.export")) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = serializeContactsCsv(await exportContacts());
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vra-contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
