import { requirePagePermission } from "@/lib/permissions/authorization";
import { listDevelopments } from "../queries/development.queries";
import { developmentStatuses } from "../schemas/development.schema";

/**
 * Loads data for the developments list page.
 */
export async function loadDevelopmentsPageData(
  searchParams: Promise<Record<string, string | string[] | undefined>>,
) {
  const context = await requirePagePermission("developments.view");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const search = typeof params.search === "string" ? params.search : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const data = await listDevelopments({ page, search, status });

  const query = (next: number) => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (status) p.set("status", status);
    p.set("page", String(next));
    return `?${p}`;
  };

  return {
    context,
    data,
    query,
    page,
    search,
    status,
    developmentStatuses,
  };
}
