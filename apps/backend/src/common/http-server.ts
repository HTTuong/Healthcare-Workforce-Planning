import type { Server } from 'node:http';

/** How long an idle connection stays open. Longer than the 60 s idle timeout of common proxies and load balancers. */
export const KEEP_ALIVE_TIMEOUT_MS = 65_000;

/**
 * Keeps idle connections open longer than any client or proxy in front of the API would keep them (F-14).
 * Node closes an idle connection after 5 s (6 s with its buffer). A client that sent its next request at that moment
 * got ECONNRESET: the Playwright suite hit it about once in three parallel runs, and the same race can turn into a
 * 502 behind a proxy that reuses connections. The headers timeout must stay above the keep-alive timeout.
 */
export function configureKeepAlive(server: Pick<Server, 'keepAliveTimeout' | 'headersTimeout'>): void {
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = KEEP_ALIVE_TIMEOUT_MS + 1_000;
}
