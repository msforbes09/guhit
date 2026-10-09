/**
 * Wraps a load so callers share it: a second call joins the attempt in flight
 * or reuses its success, and only a failure lets the next call start afresh.
 * "Continue download" then picks up just the models that had not finished.
 */
export function sharedAttempt<T>(start: () => Promise<T>): () => Promise<T> {
  let attempt: Promise<T> | null = null;
  return () => {
    attempt ??= start().catch((error) => {
      attempt = null;
      throw error;
    });
    return attempt;
  };
}
