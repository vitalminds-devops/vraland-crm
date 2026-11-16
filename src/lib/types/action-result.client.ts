import type { ActionResult, ValidationDetails } from "./action-result";

export function fieldErrorsOf(result: ActionResult<unknown>): Record<string, string[]> {
  return validationDetails(result)?.fieldErrors ?? {};
}

export function detailsOf<D>(result: ActionResult<unknown>): D | undefined {
  if (result.success) return undefined;
  return result.error.details as D | undefined;
}

function validationDetails(result: ActionResult<unknown>): ValidationDetails | undefined {
  if (result.success) return undefined;
  const details = result.error.details;
  if (!details || typeof details !== "object") return undefined;
  const candidate = details as Partial<ValidationDetails>;
  if (!candidate.fieldErrors && !candidate.formErrors) return undefined;
  return {
    formErrors: candidate.formErrors ?? [],
    fieldErrors: candidate.fieldErrors ?? {},
  };
}
