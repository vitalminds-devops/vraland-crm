import type { ZodError } from "zod";

import { ActionErrorCode } from "../errors/action-error";
import type { ActionError } from "../errors/action-error";

/**
 * Success result with optional data.
 */
export interface ActionSuccess<T = void> {
  success: true;
  data: T;
}

/**
 * Error result with structured error information.
 */
export interface ActionErrorResult {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ValidationDetails {
  formErrors: string[];
  /** Field path joined with "." -> messages. */
  fieldErrors: Record<string, string[]>;
}

export type ActionResult<T = void> = ActionSuccess<T> | ActionErrorResult;

/**
 * Helper function to create a success result.
 */
export function success(): ActionSuccess<void>;
export function success<T>(data: T): ActionSuccess<T>;
export function success<T>(data?: T): ActionSuccess<T | undefined> {
  return { success: true, data };
}

/**
 * Helper function to create an error result from an ActionError.
 */
export function failure(error: ActionError): ActionErrorResult {
  return {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
    },
  };
}

/**
 * Helper function to create an error result from code and message.
 */
export function failureFrom(code: string, message: string, details?: unknown): ActionErrorResult {
  return {
    success: false,
    error: { code, message, details },
  };
}

/**
 * Helper function to create a validation error result.
 */
export function validationFailure(message: string, details?: unknown): ActionErrorResult {
  return failureFrom(ActionErrorCode.VALIDATION_ERROR, message, details);
}

export function validationFailureFromZod(
  error: ZodError,
  message = "Review the highlighted fields.",
): ActionErrorResult {
  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];

  for (const issue of error.issues) {
    if (issue.path.length === 0) {
      formErrors.push(issue.message);
      continue;
    }
    const key = issue.path.map(String).join(".");
    (fieldErrors[key] ??= []).push(issue.message);
  }

  return failureFrom(ActionErrorCode.VALIDATION_ERROR, message, {
    formErrors,
    fieldErrors,
  } satisfies ValidationDetails);
}

/**
 * Helper function to create a not found error result.
 */
export function notFoundFailure(resource: string): ActionErrorResult {
  return failureFrom(ActionErrorCode.RESOURCE_NOT_FOUND, `${resource} not found.`);
}

/**
 * Helper function to create a database error result.
 */
export function databaseFailure(message?: string, details?: unknown): ActionErrorResult {
  return failureFrom(
    ActionErrorCode.DATABASE_ERROR,
    message || "A database error occurred.",
    details,
  );
}
