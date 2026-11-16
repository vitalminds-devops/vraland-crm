import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import {
  Table as UiTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getLostAnalysis } from "@/features/deals/queries/deal.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";
export default async function LostPage() {
  await requirePagePermission("deals.view");
  const data = await getLostAnalysis();
  return (
    <PageContainer>
      <PageHeader
        title="Lost opportunities"
        description="Why opportunities were lost."
        actions={<BackButton fallbackHref="/pipeline" label="Back to pipeline" />}
      />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Metric label="Lost opportunities" value={String(data.summary.count)} />
        <Metric label="Value lost" value={money(data.summary.value)} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Table
          title="Top lost reasons"
          headers={["Reason", "Opportunities", "Value"]}
          rows={data.reasons.map((v) => [v.name || "Unspecified", String(v.count), money(v.value)])}
        />
        <Table
          title="By agent"
          headers={["Agent", "Opportunities", "Value"]}
          rows={data.agents.map((v) => [
            v.firstName ? `${v.firstName} ${v.lastName}` : "Unassigned",
            String(v.count),
            money(v.value),
          ])}
        />
        <Table
          title="Monthly trend"
          headers={["Month", "Opportunities", "Value"]}
          rows={data.monthly.map((v) => [v.month || "Unknown", String(v.count), money(v.value)])}
        />
      </div>
    </PageContainer>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
function Table({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <h2 className="p-4 font-semibold">{title}</h2>
      <div className="overflow-x-auto">
        <UiTable className="w-full text-left text-sm">
          <TableHeader className="bg-muted/60 text-xs text-muted-foreground">
            <TableRow>
              {headers.map((v) => (
                <TableHead key={v} className="px-4 py-2">
                  {v}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y">
            {rows.map((row, i) => (
              <TableRow key={i}>
                {row.map((v, j) => (
                  <TableCell key={j} className="px-4 py-3">
                    {v}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </UiTable>
      </div>
      {!rows.length && <p className="p-6 text-sm text-muted-foreground">No lost opportunities.</p>}
    </section>
  );
}
const money = (v: string) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number(v));
