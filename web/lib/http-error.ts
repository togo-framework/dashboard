// Shared error type for calls to the togo backend. Carries the HTTP status so
// the UI can tell "signed out" (401), "not allowed" (403) and "API not installed"
// (404/501) from an ordinary failure.

export class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export const isUnauthorized = (e: unknown): boolean => e instanceof HttpError && e.status === 401;
export const isForbidden = (e: unknown): boolean => e instanceof HttpError && e.status === 403;
export const isUnavailable = (e: unknown): boolean =>
  e instanceof HttpError && (e.status === 404 || e.status === 501);

/** A human-readable message for any thrown value. */
export const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Builds an HttpError from a failed response, using the backend's `error`/`detail` text. */
export async function httpErrorFrom(res: Response, fallback: string): Promise<HttpError> {
  const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
  return new HttpError(data.error || data.detail || `${fallback} (${res.status})`, res.status);
}
