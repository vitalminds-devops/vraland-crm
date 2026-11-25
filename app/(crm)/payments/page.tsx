import Link from "next/link";
import {
  CalendarCheck,
  CalendarClock,
  CircleDollarSign,
  Download,
  Search,
  Ticket,
} from "lucide-react";
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
import { paymentSuggestions } from "@/features/billing/lib/payment-suggestions";
import { listOpenBills, listPayments } from "@/features/billing/queries/billing.queries";
import {
  paymentClassificationLabels,
  paymentMethodLabels,
} from "@/features/billing/schemas/billing.schema";
import { formatContactName } from "@/features/contacts/lib/helpers";
import { requirePagePermission } from "@/lib/permissions/authorization";
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
  // View billing reads payments; recording one needs Manage bills and payments too.
  const context = await requirePagePermission("billing.view");
  const canManage = canManageBilling(context);

  const q = await searchParams;
  const page = Math.max(1, Math.floor(Number(q.page) || 1));
  const [data, openBills] = await Promise.all([
    listPayments({ page, pageSize: PAGE_SIZE, search: q.search }),
    canManage ? listOpenBills() : [],
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
        description="Payments recorded on bills"
        actions={
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/payments/export${q.search ? `?search=${encodeURIComponent(q.search)}` : ""}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              <Download aria-hidden="true" className="mr-2 h-4 w-4" />
              Export
            </a>
            {canManage && (
              <RecordPaymentButton
                bills={openBills.map((bill) => ({
                  id: bill.id,
                  // First segment only ("Unit 1A"); the full label overflows the dialog.
                  // Multi-unit labels are joined with " + " (billing.actions.ts).
                  label: `${lead(bill)} · ${bill.unitLabel.split(/ · | \+ /)[0]}${bill.unitLabel.includes(" + ") ? "…" : ""} · ${peso(bill.balance)}`,
                  balance: bill.balance,
                  suggested: paymentSuggestions({
                    reservationFee: bill.reservationFee,
                    monthlyAmortization: bill.monthlyAmortization,
                    balance: Number(bill.balance),
                    payments: [{ amount: bill.reservationPaid, classification: "reservation" }],
                  }),
                }))}
              />
            )}
          </div>
        }
      />

      {/* The amount leads; how many payments sits underneath. */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["Collected", data.summary.collected, data.summary.count, CircleDollarSign],
            ["This month", data.summary.thisMonth, data.summary.thisMonthCount, CalendarCheck],
            ["Reservation", data.summary.reservation, data.summary.reservationCount, Ticket],
            ["Monthly", data.summary.monthly, data.summary.monthlyCount, CalendarClock],
          ] as const
        ).map(([label, amount, payments, icon]) => (
          <StatCard
            key={label}
            label={label}
            value={peso(amount)}
            detail={`${payments.toLocaleString()} ${payments === 1 ? "payment" : "payments"}`}
            icon={icon}
          />
        ))}
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
            <div>
              <Table className="w-full text-left text-sm">
                <TableHeader className="hidden bg-muted/60 text-xs text-muted-foreground md:table-header-group">
                  <TableRow>
                    <TableHead scope="col" className="px-4 py-3 whitespace-nowrap">
                      Date paid
                    </TableHead>
                    <TableHead scope="col" className="w-[38%] px-4 py-3">
                      Contact & property
                    </TableHead>
                    <TableHead scope="col" className="px-4 py-3">
                      Broker
                    </TableHead>
                    <TableHead scope="col" className="px-4 py-3">
                      Payment details
                    </TableHead>
                    <TableHead scope="col" className="px-4 py-3 text-right">
                      Amount paid
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y">
                  {data.rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="grid grid-cols-2 gap-4 p-4 md:table-row md:p-0"
                    >
                      <TableCell className="block p-0 align-top md:table-cell md:px-4 md:py-4">
                        <span className="mb-1 block text-xs text-muted-foreground md:hidden">
                          Date paid
                        </span>
                        <span className="whitespace-nowrap">{calendarDate(row.paidOn)}</span>
                      </TableCell>
                      <TableCell className="order-first col-span-2 block min-w-0 p-0 align-top md:table-cell md:px-4 md:py-4">
                        <Link
                          href={`/billing/${row.dealId}`}
                          className="font-semibold underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                        >
                          {lead(row)}
                        </Link>
                        <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                          {row.unitLabel.split(" + ").map((unit, index) => (
                            <li key={index} className="break-words">
                              {unit}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 text-xs text-muted-foreground">{row.dealCode}</p>
                      </TableCell>
                      <TableCell className="block min-w-0 p-0 align-top break-words md:table-cell md:px-4 md:py-4">
                        <span className="mb-1 block text-xs text-muted-foreground md:hidden">
                          Broker
                        </span>
                        {row.brokerFirstName
                          ? `${row.brokerFirstName} ${row.brokerLastName}`
                          : "No broker"}
                      </TableCell>
                      <TableCell className="block min-w-0 p-0 align-top md:table-cell md:px-4 md:py-4">
                        <span className="mb-1 block text-xs text-muted-foreground md:hidden">
                          Payment details
                        </span>
                        <p className="font-medium">
                          {paymentClassificationLabels[
                            row.classification as keyof typeof paymentClassificationLabels
                          ] ?? row.classification}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {paymentMethodLabels[row.method as keyof typeof paymentMethodLabels] ??
                            row.method}
                        </p>
                        <p className="mt-2 text-xs break-all text-muted-foreground">
                          {row.referenceNo ? `Invoice no. ${row.referenceNo}` : "No invoice no."}
                        </p>
                      </TableCell>
                      <TableCell className="block p-0 text-right align-top font-semibold whitespace-nowrap tabular-nums md:table-cell md:px-4 md:py-4">
                        <span className="mb-1 block text-xs font-normal text-muted-foreground md:hidden">
                          Amount paid
                        </span>
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
