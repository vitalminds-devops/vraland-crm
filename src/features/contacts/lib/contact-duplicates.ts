export type DuplicateContactSummary = {
  id: string;
  contactCode: string;
  firstName: string;
  lastName: string;
};

export type DuplicateReason = "email" | "mobile" | "name";

export type DuplicateMatch = {
  /** "exact" blocks creation; "name" is a soft warning only. */
  kind: "exact" | "name";
  reason: DuplicateReason;
  contact: DuplicateContactSummary;
};

/** Fields a candidate contact supplies for a duplicate check. */
export type DuplicateCheckInput = {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email?: string | null;
  mobilePhone1?: string | null;
  mobilePhone2?: string | null;
  mobilePhone3?: string | null;
};

/** A row already seen earlier in the same import file. */
export type DuplicateCandidate = DuplicateContactSummary & {
  email?: string | null;
  mobilePhone1?: string | null;
  mobilePhone2?: string | null;
  mobilePhone3?: string | null;
};

// The statuses shown in the CSV import summary.
export type ImportRowStatus = "created" | "skipped" | "flagged";

export type ImportRowResult = {
  row: number;
  status: ImportRowStatus;
  reason: string;
  contactId?: string;
};

/** Trim and lowercase an email, returning null for blank values. */
export function normalizeContactEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email ? email : null;
}

export function normalizeContactMobile(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  return digits.startsWith("63") ? `0${digits.slice(2)}` : digits;
}

/** The distinct, non-blank canonical mobile numbers supplied by a candidate. */
export function normalizedMobileValues(input: {
  mobilePhone1?: string | null;
  mobilePhone2?: string | null;
  mobilePhone3?: string | null;
}): string[] {
  const values = [
    normalizeContactMobile(input.mobilePhone1),
    normalizeContactMobile(input.mobilePhone2),
    normalizeContactMobile(input.mobilePhone3),
  ].filter((value): value is string => value !== null);
  return [...new Set(values)];
}

/** Case-insensitive key for the full name so "Maria Clara Santos" matches. */
export function normalizeFullName(
  firstName: string | null | undefined,
  middleName: string | null | undefined,
  lastName: string | null | undefined,
): string | null {
  const parts = [firstName, middleName, lastName]
    .map((part) => part?.trim().toLowerCase() ?? "")
    .filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

export function findDuplicateInSet(
  candidates: readonly DuplicateCandidate[],
  input: DuplicateCheckInput,
): DuplicateMatch | null {
  const email = normalizeContactEmail(input.email);
  const mobiles = normalizedMobileValues(input);
  const name = normalizeFullName(input.firstName, input.middleName, input.lastName);
  let nameMatch: DuplicateMatch | null = null;

  for (const candidate of candidates) {
    const candidateEmail = normalizeContactEmail(candidate.email);
    if (email && candidateEmail && email === candidateEmail)
      return { kind: "exact", reason: "email", contact: toSummary(candidate) };

    if (mobiles.length) {
      const candidateMobiles = normalizedMobileValues(candidate);
      if (mobiles.some((value) => candidateMobiles.includes(value)))
        return {
          kind: "exact",
          reason: "mobile",
          contact: toSummary(candidate),
        };
    }

    if (name) {
      const candidateFullName = normalizeFullName(candidate.firstName, null, candidate.lastName);
      if (!nameMatch && name === candidateFullName)
        nameMatch = { kind: "name", reason: "name", contact: toSummary(candidate) };
    }
  }

  return nameMatch;
}

function toSummary(candidate: DuplicateCandidate): DuplicateContactSummary {
  return {
    id: candidate.id,
    contactCode: candidate.contactCode,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
  };
}

export type DuplicateGroupMember = DuplicateContactSummary & {
  email: string | null;
  mobilePhones: string[];
};

export type DuplicateGroup = {
  field: "email" | "mobile";
  value: string;
  contacts: DuplicateGroupMember[];
};

export type ReportedContactRow = {
  id: string;
  contactCode: string;
  firstName: string;
  lastName: string;
  email: string | null;
  mobilePhoneNormalized1: string | null;
  mobilePhoneNormalized2: string | null;
  mobilePhoneNormalized3: string | null;
};

export function groupDuplicates(rows: readonly ReportedContactRow[]): DuplicateGroup[] {
  const groups = new Map<string, DuplicateGroup>();

  const push = (field: "email" | "mobile", value: string, row: ReportedContactRow) => {
    const key = `${field}:${value}`;
    const group = groups.get(key) ?? { field, value, contacts: [] };
    group.contacts.push({
      id: row.id,
      contactCode: row.contactCode,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      mobilePhones: [
        row.mobilePhoneNormalized1,
        row.mobilePhoneNormalized2,
        row.mobilePhoneNormalized3,
      ].filter((phone): phone is string => phone !== null),
    });
    groups.set(key, group);
  };

  for (const row of rows) {
    if (row.email) push("email", row.email, row);
    for (const phone of [
      row.mobilePhoneNormalized1,
      row.mobilePhoneNormalized2,
      row.mobilePhoneNormalized3,
    ])
      if (phone) push("mobile", phone, row);
  }

  return [...groups.values()].filter((group) => group.contacts.length > 1);
}
