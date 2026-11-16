import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, CircleDollarSign, Download, Hash, Search } from "lucide-react";
import { FilterForm } from "@/components/common/filter-form";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ButtonLink, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RecordPaymentButton } from "@/features/billing/components/payment-dialogs";
import { calendarDate, peso } from "@/features/billing/lib/format";
import { listOpenBills, listPayments } from "@/features/billing/queries/billing.queries";
import {
  paymentClassificationLabels,
  paymentMethodLabels,
} from "@/features/billing/schemas/billing.schema";
import { formatContactName } from "@/features/contacts/lib/helpers";
import { getAuthorizationContext } from "@/lib/permissions/authorization";
import { canManageBilling } from "@/lib/permissions/policy";

const PAGE_SIZE = 25;
const input = "rounded-md border bg-background px-3 py-2 text-sm";

const lead = (row: { firstName: string | null; lastName: string | null }) =>
  row.firstName
    ? formatContactName({
        firstName: row.firstName,
        lastName: row.lastName ?? "",
      })
    : "—";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  const context = await getAuthorizationContext();
  if (!context) redirect("/login");
  if (!canManageBilling(context)) redirect("/forbidden");

  const q = await searchParams;
  const page = Math.max(1, Math.floor(Number(q.page) || 1));
  const [data, openBills] = await Promise.all([
    listPayments({ page, pageSize: PAGE_SIZE, search: q.search }),
    listOpenBills(),
  ]);
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const href = (next: number) =>
    `/payments?${new URLSearchParams({
      ...(q.search ? { search: q.search } : {}),
      ...(next > 1 ? { page: String(next) } : {}),
    }).toString()}`;

  return (
    <PageContainer>
      <PageHeader
        title="Payments"
        description="Payments against broker bills"
        actions={
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/payments/export${q.search ? `?search=${encodeURIComponent(q.search)}` : ""}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              <Download aria-hidden="true" className="mr-2 h-4 w-4" />
              Export
            </a>
            <RecordPaymentButton
              bills={openBills.map((bill) => ({
                id: bill.id,
                // First segment only ("Unit 1A"); the full label overflows the dialog.
                // Multi-unit labels are joined with " + " (billing.actions.ts).
                label: `${lead(bill)} · ${bill.unitLabel.split(/ · | \+ /)[0]}${bill.unitLabel.includes(" + ") ? "…" : ""} · ${peso(bill.balance)}`,
                balance: bill.balance,
              }))}
            />
          </div>
        }
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Collected"
          value={peso(data.summary.collected)}
          detail="All recorded payments."
          icon={CircleDollarSign}
        />
        <StatCard
          label="This month"
          value={peso(data.summary.thisMonth)}
          detail="Paid since the 1st (Manila time)."
          icon={CalendarCheck}
        />
        <StatCard
          label="Payments"
          value={data.summary.count.toLocaleString()}
          detail="Number of payments recorded."
          icon={Hash}
        />
      </div>

      <div className="mt-6 rounded-xl border bg-card">
        <FilterForm className="flex flex-col gap-2 border-b p-4 md:flex-row">
          <label className="relative min-w-0 md:flex-1">
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              name="search"
              defaultValue={q.search}
              placeholder="Search contact, broker, unit or invoice no."
              aria-label="Search payments"
              className={`${input} pl-9`}
            />
          </label>
        </FilterForm>

        {data.rows.length ? (
          <>
            <div className="overflow-x-auto">
              <Table className="w-full text-left text-sm">
                <TableHeader className="bg-muted/60 text-xs uppercase text-muted-foreground">
                  <TableRow>
                    <TableHead className="px-4 py-3">Date</TableHead>
                    <TableHead className="px-4 py-3">Contact</TableHead>
                    <TableHead className="px-4 py-3">Broker</TableHead>
                    <TableHead className="px-4 py-3">For</TableHead>
                    <TableHead className="px-4 py-3">Method</TableHead>
                    <TableHead className="px-4 py-3">Invoice no.</TableHead>
                    <TableHead className="px-4 py-3 text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y">
                  {data.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="px-4 py-3">{calendarDate(row.paidOn)}</TableCell>
                      <TableCell className="px-4 py-3">
                        <Link
                          href={`/billing/${row.dealId}`}
                          className="font-medium hover:underline"
                        >
                          {lead(row)}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {row.dealCode} · {row.unitLabel}
                        </p>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        {row.brokerFirstName
                          ? `${row.brokerFirstName} ${row.brokerLastName}`
                          : "No broker"}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        {paymentClassificationLabels[
                          row.classification as keyof typeof paymentClassificationLabels
                        ] ?? row.classification}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        {paymentMethodLabels[row.method as keyof typeof paymentMethodLabels] ??
                          row.method}
                      </TableCell>
                      <TableCell className="px-4 py-3">{row.referenceNo ?? "—"}</TableCell>
                      <TableCell className="px-4 py-3 text-right tabular-nums">
                        {peso(row.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t p-4 text-sm">
              <span>
                {data.total.toLocaleString()} {data.total === 1 ? "payment" : "payments"}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <ButtonLink href={href(page - 1)} variant="secondary">
                    Previous
                  </ButtonLink>
                )}
                {page < pages && (
                  <ButtonLink href={href(page + 1)} variant="secondary">
                    Next
                  </ButtonLink>
                )}
              </div>
            </footer>
          </>
        ) : (
          <div className="grid min-h-48 place-items-center px-6 text-center text-sm text-muted-foreground">
            {q.search ? "No payments match this search." : "No payments yet."}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
