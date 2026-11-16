import { redirect } from "next/navigation";
import { requirePagePermission } from "@/lib/permissions/authorization";
export default async function ReportsPage() {
  await requirePagePermission("reports.view");
  redirect("/reports/sales");
}
