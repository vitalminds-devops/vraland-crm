import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  billItems,
  bills,
  contacts,
  dealContacts,
  deals,
  developments,
  documents,
  payments,
  pipelineStages,
  properties,
  units,
  users,
} from "@/db/schema";
import { AuthorizationError, requireAuthorizationContext } from "@/lib/permissions/authorization";
import {
  canManageBilling,
  canViewBilling,
  type AuthorizationContext,
} from "@/lib/permissions/policy";
import { dataScopeCondition } from "@/lib/permissions/scope";
import { manilaDate } from "@/lib/utils/manila-time";
import { leadNotArchived } from "@/features/deals/lib/lead-not-archived";
import { isContactsFirstDeal } from "@/features/deals/lib/first-deal";
import { billApplicantSchema } from "../schemas/bill-applicant.schema";
import { dealMonthlyAmortization, dealReservationFee } from "../lib/deal-payment";

export const billStatuses = ["unbilled", "unpaid", "partial", "paid"] as const;
export type BillStatus = (typeof billStatuses)[number];

const brokerUser = alias(users, "broker_user");

const total = sql<string>`(${bills.unitPrice} - ${bills.reservationDiscount} + ${bills.miscellaneousFee})`;
const paid = sql<string>`coalesce((select sum(${payments.amount}) from ${payments}
  where ${payments.billId} = ${bills.id} and ${payments.deletedAt} is null), 0)`;

const statusCondition: Record<BillStatus, SQL> = {
  unbilled: sql`${bills.id} is null`,
  unpaid: sql`${bills.id} is not null and ${paid} = 0`,
  partial: sql`${bills.id} is not null and ${paid} > 0 and ${paid} < ${total}`,
  paid: sql`${bills.id} is not null and ${paid} >= ${total}`,
};

const statusOf = sql<BillStatus>`case
  when ${bills.id} is null then 'unbilled'
  when ${paid} = 0 then 'unpaid'
  when ${paid} < ${total} then 'partial'
  else 'paid' end`;

async function billingContext() {
  const context = await requireAuthorizationContext();
  if (!canViewBilling(context)) throw new AuthorizationError();
  return context;
}

/** The opportunities in the user's data access. */
function dealScope(context: AuthorizationContext) {
  return and(
    eq(deals.organizationId, context.organizationId),
    isNull(deals.deletedAt),
    dataScopeCondition(context, {
      organizationId: deals.organizationId,
      ownerUserId: deals.primaryAgentUserId,
      brokerUserId: deals.brokerUserId,
    }),
    leadNotArchived,
  );
}

/** Each opportunity once, labelled with its primary contact (the lead). */
const dealRows = () =>
  db
    .select({
      dealId: deals.id,
      dealCode: deals.dealCode,
      title: deals.title,
      amount: deals.amount,
      parkingSlots: deals.parkingSlots,
      parkingAmount: deals.parkingAmount,
      // The same amounts the payment gates need, summed over the deal's units.
      reservationFee: dealReservationFee,
      monthlyAmortization: dealMonthlyAmortization,
      stageName: pipelineStages.name,
      dealStatus: deals.status,
      contactId: contacts.id,
      contactCode: contacts.contactCode,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      addressLine1: contacts.currentAddressLine1,
      barangay: contacts.currentBarangay,
      city: contacts.currentCity,
      province: contacts.currentProvince,
      propertyTitle: properties.title,
      floorAreaSqm: properties.floorAreaSqm,
      developmentName: developments.name,
      unitCode: units.code,
      dealUnitId: deals.unitId,
      dealUnitIds: deals.unitIds,
      preferredUnitIds: contacts.preferredUnitIds,
      firstDeal: isContactsFirstDeal,
      brokerFirstName: brokerUser.firstName,
      brokerLastName: brokerUser.lastName,
      billId: bills.id,
      unitLabel: bills.unitLabel,
      unitPrice: bills.unitPrice,
      askingPrice: properties.askingPrice,
      miscellaneousFee: bills.miscellaneousFee,
      reservationDiscount: bills.reservationDiscount,
      notes: bills.notes,
      total: sql<string | null>`case when ${bills.id} is null then null else ${total} end`,
      paid,
      status: statusOf.as("billing_status"),
      fullCount: sql<number>`(count(*) over ())::int`,
    })
    .from(deals)
    .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .leftJoin(bills, eq(bills.dealId, deals.id))
    .leftJoin(
      dealContacts,
      and(eq(dealContacts.dealId, deals.id), eq(dealContacts.isPrimary, true)),
    )
    .leftJoin(contacts, eq(dealContacts.contactId, contacts.id))
    .leftJoin(properties, eq(deals.propertyId, properties.id))
    .leftJoin(developments, eq(deals.developmentId, developments.id))
    .leftJoin(units, eq(deals.unitId, units.id))
    .leftJoin(brokerUser, eq(deals.brokerUserId, brokerUser.id));

type DealRow = Awaited<ReturnType<typeof dealRows>>[number];
export type BillLine = {
  unitLabel: string;
  unitPrice: string;
  miscellaneousFee: string;
};

/**
 * Each opportunity's bill lines: the saved ones once billed, otherwise one suggested line per unit
 * (the opportunity's unit plus every unit the lead picked), priced from the deal amount or gross list price.
 */
async function billLinesFor(
  organizationId: string,
  rows: DealRow[],
): Promise<Map<string, BillLine[]>> {
  const billIds = rows.flatMap((row) => (row.billId ? [row.billId] : []));
  const unitIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.billId
          ? []
          : [
              row.dealUnitId,
              ...(row.dealUnitIds?.length
                ? row.dealUnitIds
                : row.firstDeal
                  ? (row.preferredUnitIds ?? [])
                  : []),
            ].filter((id): id is string => Boolean(id)),
      ),
    ),
  ];
  const [itemRows, unitRows] = await Promise.all([
    billIds.length
      ? db
          .select({
            billId: billItems.billId,
            unitLabel: billItems.unitLabel,
            unitPrice: billItems.unitPrice,
            miscellaneousFee: billItems.miscellaneousFee,
          })
          .from(billItems)
          .where(inArray(billItems.billId, billIds))
          .orderBy(asc(billItems.position))
      : [],
    unitIds.length
      ? db
          .select({
            id: units.id,
            code: units.code,
            propertyTitle: properties.title,
            developmentName: developments.name,
            askingPrice: properties.askingPrice,
          })
          .from(units)
          .innerJoin(properties, eq(units.buildingId, properties.id))
          .leftJoin(developments, eq(properties.developmentId, developments.id))
          .where(and(inArray(units.id, unitIds), eq(properties.organizationId, organizationId)))
      : [],
  ]);
  const unitById = new Map(unitRows.map((unit) => [unit.id, unit]));

  return new Map(
    rows.map((row) => {
      if (row.billId) {
        const saved = itemRows.filter((item) => item.billId === row.billId);
        // Bills saved before lines existed (schema pushed, not migrated) keep their one line on the bill.
        return [
          row.dealId,
          saved.length
            ? saved
            : [
                {
                  unitLabel: row.unitLabel ?? "",
                  unitPrice: row.unitPrice ?? "0",
                  miscellaneousFee: row.miscellaneousFee ?? "0",
                },
              ],
        ];
      }
      const picked = [
        ...new Set([
          row.dealUnitId,
          ...(row.dealUnitIds?.length
            ? row.dealUnitIds
            : row.firstDeal
              ? (row.preferredUnitIds ?? [])
              : []),
        ]),
      ].flatMap((id) => {
        const unit = id ? unitById.get(id) : undefined;
        return unit ? [unit] : [];
      });
      const suggested = picked.map((unit) => ({
        unitLabel: [`Unit ${unit.code}`, unit.propertyTitle, unit.developmentName]
          .filter(Boolean)
          .join(" · "),
        // New totals include parking; older single-unit deals keep their entered amount.
        unitPrice:
          (row.parkingAmount !== null && row.amount !== null
            ? ((Number(row.amount) - Number(row.parkingAmount)) / picked.length).toFixed(2)
            : picked.length === 1
              ? row.amount
              : null) ??
          unit.askingPrice ??
          "",
        miscellaneousFee: "",
      }));
      if (row.parkingSlots > 0 && row.parkingAmount !== null) {
        suggested.push({
          unitLabel: `Parking (${row.parkingSlots} ${row.parkingSlots === 1 ? "slot" : "slots"}) · ${row.propertyTitle ?? ""}`,
          unitPrice: row.parkingAmount,
          miscellaneousFee: "",
        });
      }
      return [
        row.dealId,
        suggested.length
          ? suggested
          : [
              {
                unitLabel:
                  [row.propertyTitle, row.developmentName].filter(Boolean).join(" · ") || row.title,
                unitPrice: row.amount ?? row.askingPrice ?? "",
                miscellaneousFee: "",
              },
            ],
      ];
    }),
  );
}

export async function listBilling(input: {
  page: number;
  pageSize: number;
  search?: string;
  status?: BillStatus;
}) {
  const context = await billingContext();
  const base = dealScope(context);
  const term = input.search ? `%${input.search}%` : null;
  const matchingWhere = and(
    base,
    term
      ? or(
          ilike(contacts.firstName, term),
          ilike(contacts.lastName, term),
          ilike(contacts.contactCode, term),
          ilike(deals.dealCode, term),
          ilike(deals.title, term),
          ilike(properties.title, term),
          ilike(units.code, term),
          ilike(developments.name, term),
          ilike(bills.unitLabel, term),
          ilike(brokerUser.firstName, term),
          ilike(brokerUser.lastName, term),
        )
      : undefined,
  );

  const matchingBills = dealRows().where(matchingWhere).as("matching_bills");
  const [rows, [summary], [counts]] = await Promise.all([
    dealRows()
      .where(and(matchingWhere, input.status ? statusCondition[input.status] : undefined))
      // Unbilled and unpaid first, then the most recently changed.
      .orderBy(
        sql`case ${statusOf} when 'unbilled' then 0 when 'unpaid' then 1 when 'partial' then 2 else 3 end`,
        desc(deals.updatedAt),
      )
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    db
      .select({
        unbilled: sql<number>`count(*) filter (where ${bills.id} is null)::int`,
        billed: sql<number>`count(${bills.id})::int`,
        billedAmount: sql<string>`coalesce(sum(${total}), 0)`,
        collected: sql<string>`coalesce(sum(${paid}) filter (where ${bills.id} is not null), 0)`,
      })
      .from(deals)
      .leftJoin(bills, eq(bills.dealId, deals.id))
      .where(base),
    db
      .select({
        all: sql<number>`count(*)::int`,
        unbilled: sql<number>`count(*) filter (where ${matchingBills.status} = 'unbilled')::int`,
        unpaid: sql<number>`count(*) filter (where ${matchingBills.status} = 'unpaid')::int`,
        partial: sql<number>`count(*) filter (where ${matchingBills.status} = 'partial')::int`,
        paid: sql<number>`count(*) filter (where ${matchingBills.status} = 'paid')::int`,
      })
      .from(matchingBills),
  ]);

  return {
    rows,
    total: counts[input.status ?? "all"],
    counts,
    summary: summary ?? {
      unbilled: 0,
      billed: 0,
      billedAmount: "0",
      collected: "0",
    },
    canManage: canManageBilling(context),
  };
}

/** One opportunity's billing information and payment history; null when out of scope. */
export async function getDealBilling(dealId: string) {
  const context = await billingContext();
  const [row] = await dealRows()
    .where(and(dealScope(context), eq(deals.id, dealId)))
    .limit(1);
  if (!row) return null;

  const [contactRows, savedRows] = await Promise.all([
    row.contactId
      ? db
          .select({
            firstName: contacts.firstName,
            middleName: contacts.middleName,
            lastName: contacts.lastName,
            birthDate: contacts.birthDate,
            gender: contacts.gender,
            civilStatus: contacts.civilStatus,
            citizenship: contacts.citizenship,
            tinNumber: contacts.tinNumber,
            landline: contacts.landline,
            prcLicenseNumber: contacts.prcLicenseNumber,
            email: contacts.email,
            mobile: contacts.mobilePhone1,
            address: contacts.currentAddressLine1,
            barangay: contacts.currentBarangay,
            city: contacts.currentCity,
            province: contacts.currentProvince,
            postalCode: contacts.currentPostalCode,
            country: contacts.currentCountry,
          })
          .from(contacts)
          .where(
            and(
              eq(contacts.id, row.contactId),
              eq(contacts.organizationId, context.organizationId),
              isNull(contacts.deletedAt),
            ),
          )
          .limit(1)
      : [],
    row.billId
      ? db
          .select({ applicantDetails: bills.applicantDetails, createdAt: bills.createdAt })
          .from(bills)
          .where(and(eq(bills.id, row.billId), eq(bills.organizationId, context.organizationId)))
          .limit(1)
      : [],
  ]);
  const contact = contactRows[0];
  const applicantDetails = savedRows[0]?.applicantDetails
    ? billApplicantSchema.parse(savedRows[0].applicantDetails)
    : {
        ...billApplicantSchema.parse({}),
        firstName: contact?.firstName ?? "",
        middleName: contact?.middleName ?? "",
        lastName: contact?.lastName ?? "",
        birthDate: contact?.birthDate ?? "",
        gender: contact?.gender ?? "",
        civilStatus: contact?.civilStatus ?? "",
        citizenship: contact?.citizenship ?? "",
        tinNumber: contact?.tinNumber ?? "",
        landline: contact?.landline ?? "",
        prcLicenseNumber: contact?.prcLicenseNumber ?? "",
        emailAddress: contact?.email ?? "",
        mobileNumber: contact?.mobile ?? "",
        completeAddress: [
          contact?.address,
          contact?.barangay,
          contact?.city,
          contact?.province,
          contact?.postalCode,
          contact?.country,
        ]
          .filter(Boolean)
          .join(", "),
      };

  const paymentRows = row.billId
    ? await db
        .select({
          id: payments.id,
          amount: payments.amount,
          paidOn: payments.paidOn,
          method: payments.method,
          classification: payments.classification,
          referenceNo: payments.referenceNo,
          transactionSlipDocumentId: payments.transactionSlipDocumentId,
          notes: payments.notes,
          recordedByFirstName: users.firstName,
          recordedByLastName: users.lastName,
        })
        .from(payments)
        .leftJoin(users, eq(payments.recordedBy, users.id))
        .where(and(eq(payments.billId, row.billId), isNull(payments.deletedAt)))
        .orderBy(asc(payments.paidOn), asc(payments.createdAt))
    : [];

  const lines = await billLinesFor(context.organizationId, [row]);
  return {
    ...row,
    lines: lines.get(row.dealId) ?? [],
    payments: paymentRows,
    canManage: canManageBilling(context),
    applicantDetails,
    applicantAsOf: manilaDate(savedRows[0]?.createdAt ?? new Date()),
  };
}

/** Deals whose bills and payments the user reaches through their data access. */
function dealInDataScope(context: AuthorizationContext) {
  return dataScopeCondition(context, {
    organizationId: deals.organizationId,
    ownerUserId: deals.primaryAgentUserId,
    brokerUserId: deals.brokerUserId,
  });
}

async function paymentsContext() {
  const context = await requireAuthorizationContext();
  if (!canManageBilling(context)) throw new AuthorizationError();
  return context;
}

/** Payment evidence follows billing access and the opportunity's data scope. */
export async function getPaymentSlip(id: string) {
  const context = await requireAuthorizationContext();
  if (!canViewBilling(context) && !canManageBilling(context)) throw new AuthorizationError();
  const [record] = await db
    .select({
      name: documents.name,
      storageKey: documents.storageKey,
      mimeType: documents.mimeType,
    })
    .from(payments)
    .innerJoin(bills, eq(payments.billId, bills.id))
    .innerJoin(deals, eq(bills.dealId, deals.id))
    .innerJoin(documents, eq(payments.transactionSlipDocumentId, documents.id))
    .where(
      and(
        eq(payments.id, id),
        eq(payments.organizationId, context.organizationId),
        eq(documents.organizationId, context.organizationId),
        eq(documents.dealId, deals.id),
        isNull(payments.deletedAt),
        dealInDataScope(context),
      ),
    )
    .limit(1);
  return record ?? null;
}

/** Recorded payments on the opportunities in the user's data access, newest first. */
export async function listPayments(input: { page: number; pageSize: number; search?: string }) {
  const context = await paymentsContext();
  const base = and(
    eq(payments.organizationId, context.organizationId),
    isNull(payments.deletedAt),
    dealInDataScope(context),
  );
  const term = input.search ? `%${input.search}%` : null;
  const where = and(
    base,
    term
      ? or(
          ilike(payments.referenceNo, term),
          ilike(deals.dealCode, term),
          ilike(bills.unitLabel, term),
          ilike(contacts.firstName, term),
          ilike(contacts.lastName, term),
          ilike(brokerUser.firstName, term),
          ilike(brokerUser.lastName, term),
        )
      : undefined,
  );
  const [rows, [summary]] = await Promise.all([
    db
      .select({
        id: payments.id,
        amount: payments.amount,
        paidOn: payments.paidOn,
        method: payments.method,
        classification: payments.classification,
        referenceNo: payments.referenceNo,
        dealId: deals.id,
        dealCode: deals.dealCode,
        unitLabel: bills.unitLabel,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        brokerFirstName: brokerUser.firstName,
        brokerLastName: brokerUser.lastName,
        fullCount: sql<number>`(count(*) over ())::int`,
      })
      .from(payments)
      .innerJoin(bills, eq(payments.billId, bills.id))
      .innerJoin(deals, eq(bills.dealId, deals.id))
      .leftJoin(
        dealContacts,
        and(eq(dealContacts.dealId, deals.id), eq(dealContacts.isPrimary, true)),
      )
      .leftJoin(contacts, eq(dealContacts.contactId, contacts.id))
      .leftJoin(brokerUser, eq(bills.brokerUserId, brokerUser.id))
      .where(where)
      .orderBy(desc(payments.paidOn), desc(payments.createdAt))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    db
      .select({
        count: sql<number>`count(*)::int`,
        collected: sql<string>`coalesce(sum(${payments.amount}), 0)`,
        thisMonth: sql<string>`coalesce(sum(${payments.amount}) filter (where ${gte(payments.paidOn, `${manilaDate().slice(0, 7)}-01`)}), 0)`,
      })
      .from(payments)
      .innerJoin(bills, eq(payments.billId, bills.id))
      .innerJoin(deals, eq(bills.dealId, deals.id))
      .where(base),
  ]);

  return {
    rows,
    total: rows[0]?.fullCount ?? 0,
    summary: summary ?? { count: 0, collected: "0", thisMonth: "0" },
  };
}

/** Bills in the user's data access that still have a balance, for the "Record payment" picker. */
export async function listOpenBills() {
  const context = await paymentsContext();
  return db
    .select({
      id: bills.id,
      dealCode: deals.dealCode,
      unitLabel: bills.unitLabel,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      balance: sql<string>`${total} - ${paid}`,
    })
    .from(bills)
    .innerJoin(deals, eq(bills.dealId, deals.id))
    .leftJoin(
      dealContacts,
      and(eq(dealContacts.dealId, deals.id), eq(dealContacts.isPrimary, true)),
    )
    .leftJoin(contacts, eq(dealContacts.contactId, contacts.id))
    .where(
      and(
        eq(bills.organizationId, context.organizationId),
        isNull(deals.deletedAt),
        dealInDataScope(context),
        inArray(deals.status, ["open", "won"]),
        sql`${paid} < ${total}`,
      ),
    )
    .orderBy(asc(deals.dealCode))
    .limit(500);
}
