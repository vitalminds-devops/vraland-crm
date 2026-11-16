/** What to tell the person when a password reset fails; only a bad link means "expired". */
export function resetErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === "INVALID_TOKEN") return "Link expired. Request a new one.";
  return error.message || "Couldn't update the password. Try again.";
}
