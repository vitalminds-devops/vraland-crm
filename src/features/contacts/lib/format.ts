const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const pesoCompact = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** `"1500000.00"` -> `"₱1,500,000"`. Returns null for empty/invalid input. */
export function formatPeso(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return null;
  return peso.format(amount);
}

/** `"1500000"` -> `"₱1.5M"`, `"4000000"` -> `"₱4M"`. Handy for the combined budget range. */
function formatPesoCompact(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return null;
  // `Intl` compact renders whole millions as "₱4.0M"; drop the redundant ".0".
  return pesoCompact.format(amount).replace(/\.0(?=[A-Z])/, "");
}

export function formatPesoRange(
  min: string | number | null | undefined,
  max: string | number | null | undefined,
): string | null {
  const from = formatPesoCompact(min);
  const to = formatPesoCompact(max);
  if (from && to) return `${from} – ${to}`;
  return from ?? to;
}

export function formatPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, "");
  // +63 9XXXXXXXXX (12 digits) or 09XXXXXXXXX (11 digits) -> PH mobile.
  const national =
    digits.startsWith("63") && digits.length === 12
      ? digits.slice(2)
      : digits.startsWith("0") && digits.length === 11
        ? digits.slice(1)
        : null;
  if (!national || national.length !== 10) return trimmed;

  return `+63 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}

/** Digits-only `tel:` target so the link works everywhere. */
export function phoneHref(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  // Normalise local `09…` numbers to international form for tel: links.
  if (digits.length === 11 && digits.startsWith("0")) return `+63${digits.slice(1)}`;
  return `+${digits}`.replace(/^\+633/, "+63");
}

export function whatsappHref(value: string | null | undefined): string | null {
  const digits = phoneHref(value)?.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

/** `viber://` deep link, which takes the number in its `+63…` form. */
export function viberHref(value: string | null | undefined): string | null {
  const number = phoneHref(value);
  return number ? `viber://chat?number=${encodeURIComponent(number)}` : null;
}

export function socialHandle(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  const fromUrl = trimmed.match(/(?:instagram\.com|facebook\.com)\/([^/?#]+)/i);
  const handle = (fromUrl ? fromUrl[1] : trimmed).replace(/^@/, "");
  return handle || null;
}

/** Profile URL for a stored Instagram handle. */
export function instagramHref(value: string | null | undefined): string | null {
  const handle = socialHandle(value);
  return handle ? `https://instagram.com/${handle}` : null;
}

/** Profile URL for a stored Facebook handle. */
export function facebookHref(value: string | null | undefined): string | null {
  const handle = socialHandle(value);
  return handle ? `https://facebook.com/${handle}` : null;
}
