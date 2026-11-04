// The only place that talks to the API. Every request goes to /api, which Vite forwards to the NestJS server.

const BASE_URL: string = import.meta.env.VITE_API_URL ?? '/api';

/** A failed request. Status 0 means the server could not be reached at all. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  body?: unknown;
  token?: string | null;
}

type Listener = () => void;
let unauthorizedListener: Listener | undefined;

/**
 * Called when a request that carried a token gets 401: the token expired or the account was deactivated (F-04).
 * Returns a function that removes the listener.
 */
export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListener = listener;
  return () => {
    if (unauthorizedListener === listener) unauthorizedListener = undefined;
  };
}

/** NestJS errors carry message as a string, or as a list of strings for validation errors. */
function messageOf(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('message' in body)) return undefined;
  const { message } = body as { message: unknown };
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join(', ');
  return undefined;
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiRequest<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }

  const text = await response.text();
  const body = text === '' ? undefined : parse(text);
  if (!response.ok) {
    if (response.status === 401 && options.token) unauthorizedListener?.();
    throw new ApiError(response.status, messageOf(body) ?? `Request failed with status ${response.status}`, body);
  }
  return body as T;
}
