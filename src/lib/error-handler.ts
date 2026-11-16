/**
 * Get a user-friendly error message without exposing internal details
 */
export function getUserFacingMessage(error: unknown): string {
  if (error instanceof Error) {
    // Check for known error types that are safe to show
    const safePatterns = [
      /invalid/i,
      /required/i,
      /not found/i,
      /unauthorized/i,
      /forbidden/i,
      /already exists/i,
      /validation/i,
      /permission/i,
    ];

    const isSafe = safePatterns.some((pattern) => pattern.test(error.message));

    if (isSafe) {
      return error.message;
    }

    // For unknown errors, return a generic message
    return "An error occurred. Please try again.";
  }

  return "An unexpected error occurred.";
}
