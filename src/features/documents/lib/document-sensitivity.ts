import { requiredDocumentTypes } from "@/features/contacts/lib/contact-options";

const sensitiveDocumentCategories = ["contract", "reservation", "proof_of_income"] as const;

export function isSensitiveCategory(category: string | null | undefined): boolean {
  return !!category && (sensitiveDocumentCategories as readonly string[]).includes(category);
}

const clientFileTypes = new Set<string>(requiredDocumentTypes.map((item) => item.documentType));

/** One rule for every upload path: client files (IDs, income, bank records) are personal; the appointment form is not. */
export function isSensitiveDocument(documentType: string, category: string | null): boolean {
  if (documentType === "client_appointment_form") return false;
  return clientFileTypes.has(documentType) || isSensitiveCategory(category);
}
