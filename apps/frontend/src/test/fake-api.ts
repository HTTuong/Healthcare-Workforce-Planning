import { vi } from 'vitest';

export interface FakeResponse {
  status: number;
  body?: unknown;
}

type Handler = FakeResponse | ((init: RequestInit) => FakeResponse | Promise<FakeResponse>);

/**
 * Replaces fetch with a table of routes such as 'POST /api/auth/login'. A route that is not in the table fails the
 * test, so every request the UI makes is one the test expected.
 */
export function fakeApi(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${String(url)}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Unexpected request: ${key}`);
    const { status, body } = typeof handler === 'function' ? await handler(init) : handler;
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The parsed JSON body and headers of the n-th call to the fake. */
export function sent(fetchMock: ReturnType<typeof fakeApi>, n: number) {
  const init = (fetchMock.mock.calls[n]?.[1] ?? {}) as RequestInit;
  return {
    body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    headers: (init.headers ?? {}) as Record<string, string>
  };
}

export const NOORA = {
  sub: 26,
  role: 'EMPLOYEE',
  firstName: 'Noora',
  lastName: 'Nurse',
  email: 'noora@example.com',
  departmentId: 3
};
