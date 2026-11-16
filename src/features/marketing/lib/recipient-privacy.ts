/** Shown instead of a person the viewer's data access doesn't cover. */
export const OUTSIDE_ACCESS_LABEL = "Contact outside your access";

type RecipientPersonal = {
  contactId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  mobilePhone: string | null;
  error: string | null;
  inScope: boolean;
};

/** Keeps the delivery result; drops who it was (and the error, which can quote the address). */
export function maskRecipient<T extends RecipientPersonal>(row: T) {
  const { inScope, contactId, firstName, lastName, email, mobilePhone, error, ...result } = row;
  return inScope
    ? { ...result, masked: false, contactId, firstName, lastName, email, mobilePhone, error }
    : {
        ...result,
        masked: true,
        contactId: null,
        firstName: null,
        lastName: null,
        email: null,
        mobilePhone: null,
        error: null,
      };
}

type EnrollmentPersonal = {
  contactName: string | null;
  dealTitle: string | null;
  inScope: boolean;
};

export function maskEnrollment<T extends EnrollmentPersonal>(row: T) {
  const { inScope, contactName, dealTitle, ...result } = row;
  return inScope
    ? { ...result, masked: false, contactName, dealTitle }
    : { ...result, masked: true, contactName: null, dealTitle: null };
}
