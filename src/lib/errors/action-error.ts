export class ActionError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ActionError";
  }
}

export enum ActionErrorCode {
  // Permission errors
  PERMISSION_DENIED = "PERMISSION_DENIED",
  OUT_OF_SCOPE = "OUT_OF_SCOPE",

  // Validation errors
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INVALID_INPUT = "INVALID_INPUT",

  // Not found errors
  NOT_FOUND = "NOT_FOUND",
  RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND",

  // Conflict errors
  CONFLICT = "CONFLICT",
  DUPLICATE = "DUPLICATE",

  // Database errors
  DATABASE_ERROR = "DATABASE_ERROR",
  TRANSACTION_FAILED = "TRANSACTION_FAILED",

  // External service errors
  EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR",
  STORAGE_ERROR = "STORAGE_ERROR",

  // Rate limiting
  RATE_LIMITED = "RATE_LIMITED",

  // Generic errors
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Create a permission denied error.
 */
export function permissionDenied(message?: string): ActionError {
  return new ActionError(
    ActionErrorCode.PERMISSION_DENIED,
    message || "You do not have permission to perform this operation.",
  );
}

/**
 * Create an out of scope error.
 */
export function outOfScope(message?: string): ActionError {
  return new ActionError(
    ActionErrorCode.OUT_OF_SCOPE,
    message || "You do not have permission to modify this resource.",
  );
}

/**
 * Create a validation error.
 */
export function validationError(message: string, details?: unknown): ActionError {
  return new ActionError(ActionErrorCode.VALIDATION_ERROR, message, details);
}

/**
 * Create a conflict error.
 */
export function conflict(message: string): ActionError {
  return new ActionError(ActionErrorCode.CONFLICT, message);
}
