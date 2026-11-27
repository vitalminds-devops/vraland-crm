export type CommissionLink = {
  roleId: string;
  parentRoleId: string;
  sellerRate: number;
  parentRate: number;
};

export type CommissionShare = {
  recipient: "seller" | "broker";
  roleId: string;
  rate: number;
  amount: number;
};

/**
 * Splits a won sale by Settings → Commissions: a link between the seller's role and their broker's
 * role pays both sides; otherwise the seller earns their own role's rate. Zero-rate shares are dropped.
 */
export function commissionSplit(input: {
  base: number;
  sellerRoleIds: string[];
  /** Empty when the seller has no broker. */
  brokerRoleIds: string[];
  roleRates: ReadonlyMap<string, number | null>;
  links: CommissionLink[];
}): CommissionShare[] {
  const share = (recipient: CommissionShare["recipient"], roleId: string, rate: number) => ({
    recipient,
    roleId,
    rate,
    amount: Math.round(input.base * rate) / 100,
  });
  // shortcut: a seller or broker holding several linked roles takes the first matching link; add a priority if that ever matters.
  const link = input.links.find(
    (l) => input.sellerRoleIds.includes(l.roleId) && input.brokerRoleIds.includes(l.parentRoleId),
  );
  const shares = link
    ? [
        share("seller", link.roleId, link.sellerRate),
        share("broker", link.parentRoleId, link.parentRate),
      ]
    : input.sellerRoleIds
        .flatMap((roleId) => {
          const rate = input.roleRates.get(roleId);
          // A role without a rate, or at 0%, must not hide another role the seller holds that pays.
          return rate == null || rate <= 0 ? [] : [share("seller", roleId, rate)];
        })
        .slice(0, 1);
  return shares.filter((s) => s.rate > 0);
}
