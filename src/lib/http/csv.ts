import { csvCell } from "@/features/contacts/lib/contact-csv";

export type CsvCell = string | number | null | undefined;

/** A CSV download; cells are formula-guarded so a spreadsheet never runs them. */
export function csvResponse(rows: CsvCell[][], filename: string) {
  const body = rows.map((row) => row.map((cell) => csvCell(cell ?? "")).join(",")).join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** A closing note when an export hit its row cap, so a cut-off file never passes as complete. */
export function limitNote(count: number, limit: number): CsvCell[][] {
  if (count < limit) return [];
  return [
    [],
    [
      `Only the first ${limit.toLocaleString("en-US")} rows were exported. Narrow the filters to export the rest.`,
    ],
  ];
}
