/**
 * Reads `.message` off anything that was thrown. Supabase/PostgREST errors are sometimes plain objects rather than
 * Error instances, so this checks the shape instead of using `instanceof Error`.
 */
export function errorMessage(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const m = (error as { message?: unknown }).message;
    return typeof m === "string" ? m : m == null ? undefined : String(m);
  }
  return undefined;
}

/** Reads a string `.name` / `.code` property off a thrown value without assuming its type. */
export function errorProp(error: unknown, prop: "name" | "code"): string | undefined {
  if (typeof error === "object" && error !== null && prop in error) {
    const v = (error as Record<string, unknown>)[prop];
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}
