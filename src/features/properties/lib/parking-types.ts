/** A slot design a property reuses: its size, and the amounts new slots take. */
export type ParkingType = {
  id: string;
  name: string;
  /** Width and length in metres. */
  w: number;
  h: number;
  price: string | null;
  reservationFee: string | null;
  /** Missing on types saved before parking had a monthly amortization. */
  monthlyAmortization?: string | null;
};

/**
 * What saving a floor changes on a slot whose parking type was picked on the plan: it joins the
 * type (or none), and an available slot takes the type's price and fee. Null when nothing changes.
 */
export function slotTypeChange(
  slot: { status: string; parkingTypeId: string | null },
  typeId: string | undefined,
  types: readonly ParkingType[],
): {
  parkingTypeId: string | null;
  price?: string | null;
  reservationFee?: string | null;
  monthlyAmortization?: string | null;
} | null {
  const type = types.find((option) => option.id === typeId);
  if ((type?.id ?? null) === slot.parkingTypeId) return null;
  return {
    parkingTypeId: type?.id ?? null,
    ...(type &&
      slot.status === "available" && {
        price: type.price,
        reservationFee: type.reservationFee,
        monthlyAmortization: type.monthlyAmortization ?? null,
      }),
  };
}
