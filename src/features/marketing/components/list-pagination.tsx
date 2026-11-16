"use client";

import { useRouter } from "next/navigation";
import { TABLE_PAGE_SIZES, TablePagination } from "@/components/ui/table-pagination";
import { DEFAULT_MARKETING_PAGE_SIZE } from "../lib/marketing-meta";

export function ListPagination({
  page,
  pages,
  pageSize,
  basePath,
  preservedQuery = "",
}: {
  page: number;
  pages: number;
  pageSize: number;
  basePath: string;
  preservedQuery?: string;
}) {
  const router = useRouter();

  const go = (nextPage: number, nextPageSize: number) => {
    const params = new URLSearchParams(preservedQuery);
    params.delete("page");
    if (nextPage > 1) params.set("page", String(nextPage));
    if (nextPageSize !== DEFAULT_MARKETING_PAGE_SIZE) params.set("pageSize", String(nextPageSize));
    else params.delete("pageSize");
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath, { scroll: false });
  };

  return (
    <TablePagination
      page={page}
      pages={Math.max(1, pages)}
      pageSize={pageSize}
      pageSizes={[...TABLE_PAGE_SIZES]}
      onPageChange={(next) => go(next, pageSize)}
      onPageSizeChange={(size) => go(1, size)}
    />
  );
}
