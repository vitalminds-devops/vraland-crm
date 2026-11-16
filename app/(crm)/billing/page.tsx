import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleDollarSign, Download, FileClock, ReceiptText, Search, Wallet } from "lucide-react";
import { FilterForm } from "@/components/common/filter-form";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ButtonLink, buttonVariants } from "@/components/ui/button";
import { DotBadge } from "@/components/ui/dot-badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { billStatusBadge, peso } from "@/features/billing/lib/format";
import {
  billStatuses,
  listBilling,
  type BillStatus,
} from "@/features/billing/queries/billing.queries";
import { formatContactName } from "@/features/contacts/lib/helpers";
import { RecordPaymentButton } from "@/features/billing/components/payment-dialogs";
import { getAuthorizationContext } from "@/lib/permissions/authorization";
import { canViewBilling } from "@/lib/permissions/policy";

const PAGE_SIZE = 25;
const input = "rounded-md border bg-background px-3 py-2 text-sm";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  const context = await getAuthorizationContext();
  if (!context) redirect("/login");
  if (!canViewBilling(context)) redirect("/forbidden");

  const q = await searchParams;
  const status = (billStatuses as readonly string[]).includes(q.status ?? "")
    ? (q.status as BillStatus)
    : undefined;
  const page = Math.max(1, Math.floor(Number(q.page) || 1));
  const data = await listBilling({
    page,
    pageSize: PAGE_SIZE,
    search: q.search,
    status,
  });
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const balance = Number(data.summary.billedAmount) - Number(data.summary.collected);

  const href = (next: { page?: number; status?: string }) =>
    `/billing?${new URLSearchParams({
      ...(q.search ? { search: q.search } : {}),
      ...((next.status ?? status) ? { status: next.status ?? status! } : {}),
      ...(next.page && next.page > 1 ? { page: String(next.page) } : {}),
    }).toString()}`;

  return (
    <PageContainer>
      <PageHeader
        title="Billing"
        description={
          data.canManage
            ? "Create bills, track balances and record payments."
            : "Bills for your leads"
        }
        actions={
          <a
            href={`/api/billing/export?${new URLSearchParams({ ...(q.search ? { search: q.search } : {}), ...(status ? { status } : {}) }).toString()}`}
            className={buttonVariants({ variant: "secondary" })}
          >
            <Download aria-hidden="true" className="mr-2 h-4 w-4" />
            Export
          </a>
        }
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Not billed"
          value={data.summary.unbilled.toLocaleString()}
          detail="Opportunities with no bill yet."
          icon={FileClock}
          href={href({ status: "unbilled" })}
          active={status === "unbilled"}
        />
        <StatCard
          label="Billed"
          value={peso(data.summary.billedAmount)}
          detail={`${data.summary.billed.toLocaleString()} ${data.summary.billed === 1 ? "bill" : "bills"} issued.`}
          icon={ReceiptText}
        />
        <StatCard
          label="Collected"
          value={peso(data.summary.collected)}
          detail="Payments recorded against bills."
          icon={CircleDollarSign}
        />
        <StatCard
          label="Balance"
          value={peso(balance)}
          detail="Billed but not yet paid."
          icon={Wallet}
        />
      </div>

      <div className="mt-6 rounded-xl border bg-card">
        <nav
          aria-label="Filter bills by status"
          className="flex gap-1 overflow-x-auto border-b bg-muted/20 px-4 py-3"
        >
          {[
            { value: "", label: "All bills" },
            ...billStatuses.map((value) => ({ value, label: billStatusBadge[value].label })),
          ].map((filter) => (
            <Link
              key={filter.value}
              href={href({ status: filter.value })}
              aria-current={(status ?? "") === filter.value ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${(status ?? "") === filter.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              {filter.label}
              <span className="rounded-full bg-current/10 px-1.5 py-0.5 text-xs tabular-nums">
                {data.counts[(filter.value || "all") as BillStatus | "all"].toLocaleString()}
              </span>
            </Link>
          ))}
        </nav>
        <FilterForm className="flex gap-2 border-b p-4">
          {status && <input type="hidden" name="status" value={status} />}
          <label className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              name="search"
              defaultValue={q.search}
              placeholder="Search client, broker, property, unit or code"
              aria-label="Search billing"
              className={`${input} pl-9`}
            />
          </label>
        </FilterForm>

        {data.rows.length ? (
          <>
            <div className="overflow-x-auto">
              <Table className="w-full min-w-[1100px] text-left text-sm">
                <TableHeader className="bg-muted/60 text-xs uppercase text-muted-foreground">
                  <TableRow>
                    <TableHead className="px-4 py-3">Contact</TableHead>
                    <TableHead className="px-4 py-3">Property / unit</TableHead>
                    <TableHead className="px-4 py-3 text-right">Bill total</TableHead>
                    <TableHead className="px-4 py-3 text-right">Balance</TableHead>
                    <TableHead className="px-4 py-3">Status</TableHead>
                    <TableHead className="px-4 py-3 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y">
                  {data.rows.map((row) => {
                    const badge = billStatusBadge[row.status];
                    const remaining =
                      row.total === null ? null : Math.max(0, Number(row.total) - Number(row.paid));
                    return (
                      <TableRow key={row.dealId}>
                        <TableCell className="min-w-52 max-w-64 px-4 py-4">
                          <span className="font-medium">
                            {row.contactId
                              ? formatContactName({
                                  firstName: row.firstName ?? "",
                                  lastName: row.lastName ?? "",
                                })
                              : row.title}
                          </span>
                          <p className="text-xs text-muted-foreground">
                            {row.dealCode} · {row.stageName}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Broker:{" "}
                            {[row.brokerFirstName, row.brokerLastName].filter(Boolean).join(" ") ||
                              "Unassigned"}
                          </p>
                        </TableCell>
                        {(() => {
                          const label =
                            row.unitLabel ??
                            ([row.unitCode, row.developmentName].filter(Boolean).join(" · ") ||
                              "—");
                          // Several units are saved as "A + B"; show the first and a count, full text on hover.
                          const [first, ...rest] = label.split(" + ");
                          return (
                            <TableCell
                              title={label}
                              className="max-w-80 truncate px-4 py-4 whitespace-nowrap"
                            >
                              {first}
                              {rest.length > 0 && (
                                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                  +{rest.length}
                                </span>
                              )}
                            </TableCell>
                          );
                        })()}
                        <TableCell className="px-4 py-4 text-right whitespace-nowrap tabular-nums">
                          {peso(row.total)}
                          {row.total !== null && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Paid {peso(row.paid)}
                            </p>
                          )}
                        </TableCell>
                        <TableCell
                          className={`px-4 py-4 text-right font-semibold whitespace-nowrap tabular-nums ${remaining && remaining > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}
                        >
                          {peso(remaining)}
                        </TableCell>
                        <TableCell className="px-4 py-4 whitespace-nowrap">
                          <DotBadge tone={badge.tone}>{badge.label}</DotBadge>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                            {data.canManage &&
                              row.billId &&
                              remaining !== null &&
                              remaining > 0 && (
                                <RecordPaymentButton
                                  billId={row.billId}
                                  balance={String(remaining)}
                                  size="sm"
                                />
                              )}
                            <ButtonLink
                              href={`/billing/${row.dealId}`}
                              variant={
                                data.canManage && row.status === "unbilled"
                                  ? "primary"
                                  : "secondary"
                              }
                              size="sm"
                            >
                              {data.canManage && row.status === "unbilled"
                                ? "Create bill"
                                : "View bill"}
                            </ButtonLink>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t p-4 text-sm">
              <span>
                {data.total.toLocaleString()} {data.total === 1 ? "opportunity" : "opportunities"}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <ButtonLink href={href({ page: page - 1 })} variant="secondary">
                    Previous
                  </ButtonLink>
                )}
                {page < pages && (
                  <ButtonLink href={href({ page: page + 1 })} variant="secondary">
                    Next
                  </ButtonLink>
                )}
              </div>
            </footer>
          </>
        ) : (
          <div className="grid min-h-48 place-items-center px-6 text-center text-sm text-muted-foreground">
            {q.search || status ? "No opportunities match these filters." : "No opportunities yet."}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
