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
 * Splits a won sale by Settings → Commissions. A seller under a broker is paid only through a link
 * between their role and the broker's, which pays both sides; no link, no commission. An independent
 * seller (no broker) earns their own role's rate. Zero-rate shares are dropped.
 */
export function commissionSplit(input: {
  base: number;
  sellerRoleIds: string[];
  /** The broker's roles; empty when the broker holds none. */
  brokerRoleIds: string[];
  /** Whether the seller works under a broker other than themselves. */
  hasBroker: boolean;
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
    : input.hasBroker
      ? []
      : input.sellerRoleIds
          .flatMap((roleId) => {
            const rate = input.roleRates.get(roleId);
            // A role without a rate, or at 0%, must not hide another role the seller holds that pays.
            return rate == null || rate <= 0 ? [] : [share("seller", roleId, rate)];
          })
          .slice(0, 1);
  return shares.filter((s) => s.rate > 0);
}
