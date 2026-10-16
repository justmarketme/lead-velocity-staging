/**
 * Extracts a human-readable message from an unknown thrown value.
 * Handles Error instances and plain error-like objects (e.g. Supabase
 * PostgrestError) that expose a string `message`. Returns undefined otherwise,
 * so `getErrorMessage(e) || "fallback"` behaves like `e.message || "fallback"`.
 */
export function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return undefined;
}
