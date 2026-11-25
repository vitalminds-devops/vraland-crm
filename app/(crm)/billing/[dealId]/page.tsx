import {
  Building2,
  CalendarClock,
  Calculator,
  CircleCheck,
  ExternalLink,
  Home,
  MapPin,
  Receipt,
  Ruler,
  Ticket,
  User,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { ButtonLink } from "@/components/ui/button";
import { DotBadge } from "@/components/ui/dot-badge";
import { BillForm, EditBillButton } from "@/features/billing/components/bill-form";
import { PrintBillButton } from "@/features/billing/components/print-bill-button";
import {
  RecordPaymentButton,
  RemovePaymentButton,
} from "@/features/billing/components/payment-dialogs";
import { billStatusBadge, calendarDate, peso } from "@/features/billing/lib/format";
import { getDealBilling } from "@/features/billing/queries/billing.queries";
import {
  paymentClassificationLabels,
  paymentMethodLabels,
} from "@/features/billing/schemas/billing.schema";
import { formatContactName } from "@/features/contacts/lib/helpers";
import { getAuthorizationContext } from "@/lib/permissions/authorization";
import { canViewBilling } from "@/lib/permissions/policy";
import styles from "./print.module.css";
import { paymentSuggestions } from "@/features/billing/lib/payment-suggestions";
import { quotedTerms } from "@/features/billing/lib/quoted-terms";

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-1.5 ${strong ? "mt-1 border-t pt-2.5 text-base font-semibold" : ""}`}
    >
      <dt className={muted ? "text-muted-foreground" : ""}>{label}</dt>
      <dd className="shrink-0 text-right tabular-nums">{value}</dd>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex min-w-0 gap-2.5">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 break-words whitespace-pre-line">{value}</dd>
      </div>
    </div>
  );
}

/** A section title with a small tinted icon. */
function Heading({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-base font-semibold">
      <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      {children}
    </h2>
  );
}

// Each payment type gets its own colour and icon in the payments panel.
const paymentLook: Record<string, { icon: LucideIcon; tint: string }> = {
  reservation: { icon: Ticket, tint: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  monthly: { icon: CalendarClock, tint: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  full_payment: {
    icon: CircleCheck,
    tint: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
};

export default async function DealBillingPage({ params }: { params: Promise<{ dealId: string }> }) {
  const context = await getAuthorizationContext();
  if (!context) redirect("/login");
  if (!canViewBilling(context)) redirect("/forbidden");
  const { dealId } = await params;
  const bill = await getDealBilling(dealId);
  if (!bill) notFound();

  // What the opportunity was quoted when its units and parking were chosen, split by kind.
  const quoted = quotedTerms({
    amount: bill.amount,
    parkingAmount: bill.parkingAmount,
    reservationFee: bill.reservationFee,
    parkingReservationFee: bill.parkingReservationFee,
  });
  const hasQuote =
    quoted.rows.some((row) => row.price || row.reservationFee) || Boolean(bill.monthlyAmortization);

  const applicant = bill.applicantDetails;
  const leadName =
    applicant.firstName || applicant.lastName ? formatContactName(applicant) : bill.title;
  const badge = billStatusBadge[bill.status];
  const balance = Number(bill.total ?? 0) - Number(bill.paid);
  const sellingPrice = bill.lines.reduce((sum, line) => sum + Number(line.unitPrice), 0);
  const discount = Number(bill.reservationDiscount ?? 0);
  const netPrice = sellingPrice - discount;
  const miscFee = bill.lines.reduce((sum, line) => sum + Number(line.miscellaneousFee), 0);
  const miscPercent = netPrice > 0 ? Math.round((miscFee / netPrice) * 10000) / 100 : null;
  const address = applicant.completeAddress;
  // Line labels repeat the project, which already has its own row.
  const shortLabel = (label: string) =>
    label
      .split(" · ")
      .filter((part) => part && part !== bill.developmentName)
      .join(" · ");
  // The bill's units, one per line, or the deal's own unit before a bill exists.
  const unitLabel =
    bill.lines.map((line) => shortLabel(line.unitLabel)).join("\n") ||
    [bill.unitCode, bill.propertyTitle].filter(Boolean).join(" · ");
  const floorArea = Number(bill.floorAreaSqm ?? 0);
  const total = Number(bill.total ?? 0);
  const paidPercent = total > 0 ? Math.min(100, (Number(bill.paid) / total) * 100) : 0;
  const billInitial = {
    lines: bill.lines,
    reservationDiscount:
      bill.reservationDiscount && Number(bill.reservationDiscount) ? bill.reservationDiscount : "",
    notes: bill.notes ?? "",
    applicantDetails: bill.applicantDetails,
    applicantAsOf: bill.applicantAsOf,
  };
  const broker = bill.brokerFirstName
    ? `${bill.brokerFirstName} ${bill.brokerLastName}`
    : "No broker";

  return (
    <PageContainer className={`max-w-6xl ${bill.billId ? styles.bill : ""}`}>
      <div className="print:hidden">
        <PageHeader
          title={leadName}
          description={`${bill.dealCode} · ${bill.stageName} · Broker: ${broker}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {bill.billId && <PrintBillButton />}
              <ButtonLink href={`/deals/${bill.dealId}`} variant="secondary" className="gap-2">
                <ExternalLink aria-hidden="true" className="size-4" />
                View opportunity
              </ButtonLink>
              <BackButton fallbackHref="/billing" label="Back to billing" />
            </div>
          }
        />
      </div>
      {bill.billId && (
        <article
          className={`hidden print:block ${styles.statement}`}
          aria-label="Printable billing statement"
        >
          <header className={styles.letterhead}>
            <div className={styles.brand}>
              <Image
                src="/images/vra_logo.png"
                alt="VRA Land logo"
                width={64}
                height={80}
                unoptimized
                loading="eager"
              />
              <div>
                <p className={styles.company}>VRA Land Inc.</p>
                <p>Real Estate</p>
              </div>
            </div>
            <div className={styles.reference}>
              <h1>Billing statement</h1>
              <p>{bill.dealCode}</p>
              <p>
                {bill.stageName} · {badge.label}
              </p>
            </div>
          </header>
          <section className={styles.customer} aria-label="Customer and property details">
            <div>
              <h2>Customer</h2>
              <p className={styles.customerName}>{leadName}</p>
              {address && <p>{address}</p>}
            </div>
            <dl>
              <div>
                <dt>Development</dt>
                <dd>{bill.developmentName || "—"}</dd>
              </div>
              <div>
                <dt>Broker</dt>
                <dd>{broker}</dd>
              </div>
              {floorArea > 0 && (
                <div>
                  <dt>Floor area</dt>
                  <dd>{floorArea.toLocaleString("en-PH")} sqm</dd>
                </div>
              )}
            </dl>
          </section>
          <section aria-label="Itemized charges">
            <h2>Bill items</h2>
            <table>
              <thead>
                <tr>
                  <th scope="col">Description</th>
                  <th scope="col">Amount (PHP)</th>
                </tr>
              </thead>
              <tbody>
                {bill.lines.map((line, index) => (
                  <tr key={index}>
                    <td>{shortLabel(line.unitLabel)}</td>
                    <td>{peso(line.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <div className={styles.settlement}>
            <div>
              {hasQuote && (
                <section className={styles.terms}>
                  <h2>Quoted prices and fees</h2>
                  <dl>
                    {quoted.rows.flatMap((row) => [
                      <div key={`${row.label}-price`}>
                        <dt>{row.label === "Total" ? "Total price" : `${row.label} price`}</dt>
                        <dd>{peso(row.price)}</dd>
                      </div>,
                      <div key={`${row.label}-fee`}>
                        <dt>
                          {row.label === "Total"
                            ? "Total reservation fee"
                            : `${row.label === "Units" ? "Unit" : row.label} reservation fee`}
                        </dt>
                        <dd>{peso(row.reservationFee)}</dd>
                      </div>,
                    ])}
                    <div>
                      <dt>Monthly amortization</dt>
                      <dd>{peso(bill.monthlyAmortization)}</dd>
                    </div>
                  </dl>
                </section>
              )}
              {bill.notes && (
                <section className={styles.notes}>
                  <h2>Notes</h2>
                  <p>{bill.notes}</p>
                </section>
              )}
            </div>
            <dl className={styles.totals}>
              <div>
                <dt>Selling price</dt>
                <dd>{peso(sellingPrice)}</dd>
              </div>
              {discount > 0 && (
                <>
                  <div>
                    <dt>Reservation discount</dt>
                    <dd>−{peso(discount)}</dd>
                  </div>
                  <div>
                    <dt>Net selling price</dt>
                    <dd>{peso(netPrice)}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>Miscellaneous fee{miscPercent === null ? "" : ` (${miscPercent}%)`}</dt>
                <dd>{peso(miscFee)}</dd>
              </div>
              <div className={styles.billTotal}>
                <dt>Bill total</dt>
                <dd>{peso(bill.total)}</dd>
              </div>
              <div>
                <dt>Paid to date</dt>
                <dd>{peso(bill.paid)}</dd>
              </div>
              <div className={styles.balance}>
                <dt>Remaining balance</dt>
                <dd>{peso(balance)}</dd>
              </div>
            </dl>
          </div>
          <section className={styles.payments}>
            <h2>Payment history</h2>
            {bill.payments.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Payment</th>
                    <th scope="col">Method</th>
                    <th scope="col">Invoice no.</th>
                    <th scope="col">Amount (PHP)</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{calendarDate(payment.paidOn)}</td>
                      <td>
                        {paymentClassificationLabels[
                          payment.classification as keyof typeof paymentClassificationLabels
                        ] ?? payment.classification}
                        {payment.notes && <small>{payment.notes}</small>}
                      </td>
                      <td>
                        {paymentMethodLabels[payment.method as keyof typeof paymentMethodLabels] ??
                          payment.method}
                      </td>
                      <td>{payment.referenceNo || "—"}</td>
                      <td>{peso(payment.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No payments recorded yet.</p>
            )}
          </section>
          <footer className={styles.statementFooter}>
            <span>VRA Land Inc.</span>
            <span>{bill.dealCode} · All amounts in Philippine pesos (PHP)</span>
          </footer>
        </article>
      )}

      <div className="mt-2 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] print:hidden">
        <div className="min-w-0 space-y-6">
          <section className="@container min-w-0 rounded-xl border bg-card p-4 sm:p-5">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <Heading icon={Receipt}>
                {bill.billId ? "Bill summary" : "Opportunity details"}
              </Heading>
              <div className="flex items-center gap-2">
                <DotBadge tone={badge.tone}>{badge.label}</DotBadge>
                {bill.canManage && bill.billId && (
                  <EditBillButton
                    dealId={bill.dealId}
                    initial={billInitial}
                    priceLocked={bill.dealStatus === "won"}
                  />
                )}
              </div>
            </header>
            {bill.billId && (
              <div className="mt-5 border-y py-4">
                <dl className="grid gap-4 @min-[32rem]:grid-cols-3">
                  {(
                    [
                      ["Bill total", bill.total, "text-foreground"],
                      ["Paid to date", bill.paid, "text-emerald-700 dark:text-emerald-400"],
                      [
                        "Remaining balance",
                        String(balance),
                        balance > 0 ? "text-foreground" : "text-emerald-700 dark:text-emerald-400",
                      ],
                    ] as const
                  ).map(([label, value, tone]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${tone}`}>
                        {peso(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div
                  role="progressbar"
                  aria-label="Paid"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(paidPercent)}
                  className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${paidPercent}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {paidPercent > 0 && paidPercent < 1 ? "<1" : Math.round(paidPercent)}% paid
                </p>
              </div>
            )}
            <dl className="mt-5 grid gap-x-6 gap-y-4 text-sm @min-[30rem]:grid-cols-2">
              <Detail icon={User} label="Contact" value={leadName} />
              <Detail icon={Building2} label="Development" value={bill.developmentName} />
              <Detail
                icon={Home}
                label={
                  Number(bill.parkingAmount) > 0
                    ? "Units & parking"
                    : bill.lines.length > 1
                      ? "Units"
                      : "Unit"
                }
                value={unitLabel}
              />
              <Detail
                icon={Ruler}
                label="Floor area"
                value={floorArea > 0 ? `${floorArea.toLocaleString("en-PH")} sqm` : null}
              />
              <div className="col-span-full">
                <Detail icon={MapPin} label="Address" value={address} />
              </div>
            </dl>
            {hasQuote && (
              <div className="mt-5 border-t pt-4">
                <h3 className="text-sm font-medium">Quoted prices and fees</h3>
                <table className="mt-3 w-full text-sm tabular-nums">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th scope="col" className="pb-1.5 text-left font-normal">
                        <span className="sr-only">Item</span>
                      </th>
                      <th scope="col" className="pb-1.5 text-right font-normal">
                        Price
                      </th>
                      <th scope="col" className="pb-1.5 text-right font-normal">
                        Reservation fee
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {quoted.rows.map((row) => (
                      <tr
                        key={row.label}
                        className={row.label === "Total" ? "font-semibold" : undefined}
                      >
                        <th scope="row" className="py-1.5 text-left font-[inherit]">
                          {row.label}
                        </th>
                        <td className="py-1.5 text-right">{row.price ? peso(row.price) : "—"}</td>
                        <td className="py-1.5 text-right">
                          {row.reservationFee ? peso(row.reservationFee) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 flex items-baseline justify-between gap-3 border-t border-border/40 pt-2.5 text-sm">
                  <span className="text-muted-foreground">Monthly amortization</span>
                  <span className="tabular-nums">
                    {bill.monthlyAmortization ? peso(bill.monthlyAmortization) : "—"}
                  </span>
                </p>
              </div>
            )}
            {bill.billId && (
              <div className="mt-6 border-t pt-4 text-sm">
                <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                  <Calculator aria-hidden="true" className="size-4 text-muted-foreground" />
                  Price breakdown
                </h3>
                <dl>
                  {bill.lines.length > 1 ? (
                    bill.lines.map((line, index) => (
                      <Row
                        key={index}
                        label={shortLabel(line.unitLabel)}
                        value={peso(line.unitPrice)}
                        muted
                      />
                    ))
                  ) : (
                    <Row label="Selling price" value={peso(sellingPrice)} muted />
                  )}
                  {discount > 0 && (
                    <>
                      <Row label="Reservation discount" value={`−${peso(discount)}`} muted />
                      <Row label="Net selling price" value={peso(netPrice)} muted />
                    </>
                  )}
                  <Row
                    label={`Miscellaneous fee${miscPercent === null ? "" : ` (${miscPercent}%)`}`}
                    value={peso(miscFee)}
                    muted
                  />
                  <Row label="Bill total" value={peso(bill.total)} strong />
                </dl>
                {bill.notes && <p className="mt-2 text-muted-foreground">{bill.notes}</p>}
              </div>
            )}
          </section>
          {!bill.billId && bill.canManage && (
            <section className="min-w-0 rounded-xl border bg-card p-4 sm:p-5">
              <Heading icon={Calculator}>Create bill</Heading>
              <p className="mt-2 text-sm text-muted-foreground">
                Billed to {broker}. Review each unit’s price and miscellaneous fee, then save the
                bill.
              </p>
              <div className="mt-5">
                <BillForm dealId={bill.dealId} initial={billInitial} />
              </div>
            </section>
          )}
          {!bill.billId && !bill.canManage && (
            <p className="text-sm text-muted-foreground">
              No bill has been created for this opportunity.
            </p>
          )}
        </div>

        <aside className="min-w-0 rounded-xl border bg-card p-4 sm:p-5 xl:sticky xl:top-4 print:static print:mt-6">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <Heading icon={Wallet}>
              Payments
              {bill.payments.length > 0 && (
                <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                  {bill.payments.length}
                </span>
              )}
            </Heading>
            {/* A lost or cancelled deal takes no payments; reopen it first. */}
            {bill.canManage &&
              bill.billId &&
              balance > 0 &&
              bill.dealStatus !== "lost" &&
              bill.dealStatus !== "cancelled" && (
                <RecordPaymentButton
                  billId={bill.billId}
                  balance={String(balance)}
                  suggested={paymentSuggestions({
                    reservationFee: bill.reservationFee,
                    monthlyAmortization: bill.monthlyAmortization,
                    balance,
                    payments: bill.payments,
                  })}
                />
              )}
          </header>
          {bill.payments.length ? (
            <ul className="mt-3 divide-y text-sm">
              {/* Newest first, so the latest payment is on top. */}
              {[...bill.payments].reverse().map((payment) => (
                <li key={payment.id} className="flex items-start gap-3 py-3">
                  {(() => {
                    const look = paymentLook[payment.classification] ?? {
                      icon: Wallet,
                      tint: "bg-muted text-muted-foreground",
                    };
                    return (
                      <span
                        className={`grid size-8 shrink-0 place-items-center rounded-full ${look.tint}`}
                      >
                        <look.icon aria-hidden="true" className="size-4" />
                      </span>
                    );
                  })()}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold tabular-nums">{peso(payment.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        paymentClassificationLabels[
                          payment.classification as keyof typeof paymentClassificationLabels
                        ] ?? payment.classification,
                        paymentMethodLabels[payment.method as keyof typeof paymentMethodLabels] ??
                          payment.method,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {payment.referenceNo && (
                      <p className="mt-1 text-xs break-all text-muted-foreground">
                        Invoice no. {payment.referenceNo}
                      </p>
                    )}
                    {payment.notes && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{payment.notes}</p>
                    )}
                    {payment.transactionSlipDocumentId && (
                      <a
                        href={`/api/payments/${payment.id}/slip`}
                        className="mt-1 inline-block text-xs font-medium text-primary underline underline-offset-4"
                      >
                        Download transaction slip
                      </a>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground">
                      {calendarDate(payment.paidOn)}
                    </span>
                    {bill.canManage && (
                      <RemovePaymentButton paymentId={payment.id} amount={payment.amount} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {bill.billId
                ? "No payments recorded yet."
                : "Payments can be recorded after the bill is saved."}
            </p>
          )}
        </aside>
      </div>
    </PageContainer>
  );
}
