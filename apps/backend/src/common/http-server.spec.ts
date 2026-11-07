import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { configureKeepAlive, KEEP_ALIVE_TIMEOUT_MS } from './http-server.js';

describe('configureKeepAlive (F-14)', () => {
  it('keeps idle connections longer than the 60 s of common proxies, and the headers timeout above it', () => {
    const server = createServer();
    expect(server.keepAliveTimeout).toBe(5_000);
    configureKeepAlive(server);
    expect(server.keepAliveTimeout).toBe(KEEP_ALIVE_TIMEOUT_MS);
    expect(KEEP_ALIVE_TIMEOUT_MS).toBeGreaterThan(60_000);
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
  });
});
