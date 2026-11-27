import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bills, commissionLinks, dealCommissions, deals, roles, userRoles } from "@/db/schema";
import { commissionSplit } from "./commission-split";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Saves who earns what on a just-won opportunity, at today's Settings → Commissions rates, and sets
 * the expected commission to their total. The base is the billed net selling price, else the deal value.
 */
export async function recordDealCommissions(
  tx: DbTransaction,
  deal: {
    organizationId: string;
    dealId: string;
    amount: string | null;
    sellerUserId: string | null;
    brokerUserId: string | null;
  },
) {
  await tx.delete(dealCommissions).where(eq(dealCommissions.dealId, deal.dealId));
  if (!deal.sellerUserId) return;
  const brokerUserId = deal.brokerUserId === deal.sellerUserId ? null : deal.brokerUserId;

  const [bill] = await tx
    .select({ net: sql<string>`${bills.itemsTotal} - ${bills.reservationDiscount}` })
    .from(bills)
    .where(eq(bills.dealId, deal.dealId));
  const base = Number(bill?.net ?? deal.amount ?? 0);
  if (!(base > 0)) return;

  const userIds = brokerUserId ? [deal.sellerUserId, brokerUserId] : [deal.sellerUserId];
  const [held, roleRows, links] = await Promise.all([
    tx
      .select({ userId: userRoles.userId, roleId: userRoles.roleId })
      .from(userRoles)
      .where(inArray(userRoles.userId, userIds)),
    tx
      .select({ id: roles.id, name: roles.name, rate: roles.commissionRate })
      .from(roles)
      .where(eq(roles.organizationId, deal.organizationId)),
    tx
      .select({
        roleId: commissionLinks.roleId,
        parentRoleId: commissionLinks.parentRoleId,
        sellerRate: commissionLinks.sellerRate,
        parentRate: commissionLinks.parentRate,
      })
      .from(commissionLinks)
      .where(eq(commissionLinks.organizationId, deal.organizationId)),
  ]);
  const rolesOf = (userId: string | null) =>
    held.filter((row) => row.userId === userId).map((row) => row.roleId);
  const shares = commissionSplit({
    base,
    sellerRoleIds: rolesOf(deal.sellerUserId),
    brokerRoleIds: rolesOf(brokerUserId),
    roleRates: new Map(
      roleRows.map((role) => [role.id, role.rate === null ? null : Number(role.rate)]),
    ),
    links: links.map((link) => ({
      ...link,
      sellerRate: Number(link.sellerRate),
      parentRate: Number(link.parentRate),
    })),
  });
  if (!shares.length) return;

  const nameOf = new Map(roleRows.map((role) => [role.id, role.name]));
  await tx.insert(dealCommissions).values(
    shares.map((share) => ({
      organizationId: deal.organizationId,
      dealId: deal.dealId,
      userId: share.recipient === "seller" ? deal.sellerUserId! : brokerUserId!,
      roleName: nameOf.get(share.roleId) ?? "",
      rate: share.rate.toFixed(2),
      baseAmount: base.toFixed(2),
      amount: share.amount.toFixed(2),
    })),
  );
  await tx
    .update(deals)
    .set({ expectedCommission: shares.reduce((sum, s) => sum + s.amount, 0).toFixed(2) })
    .where(and(eq(deals.id, deal.dealId), eq(deals.organizationId, deal.organizationId)));
}
