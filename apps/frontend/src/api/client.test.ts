import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, sent } from '../test/fake-api';
import { ApiError, apiRequest, onUnauthorized } from './client';

describe('apiRequest', () => {
  let stop: (() => void) | undefined;
  afterEach(() => stop?.());

  it('sends JSON to /api with the token and returns the parsed body', async () => {
    const fetchMock = fakeApi({ 'POST /api/things': { status: 201, body: { id: 1 } } });
    await expect(apiRequest('POST', '/things', { body: { name: 'x' }, token: 'abc' })).resolves.toEqual({ id: 1 });
    expect(sent(fetchMock, 0).body).toEqual({ name: 'x' });
    expect(sent(fetchMock, 0).headers).toMatchObject({ Authorization: 'Bearer abc', 'Content-Type': 'application/json' });
  });

  it('sends no Authorization header and no body when there are none', async () => {
    const fetchMock = fakeApi({ 'GET /api/things': { status: 200, body: [] } });
    await apiRequest('GET', '/things');
    expect(sent(fetchMock, 0).headers).toEqual({ Accept: 'application/json' });
    expect(sent(fetchMock, 0).body).toBeUndefined();
  });

  it('returns undefined for an empty body, such as 204', async () => {
    fakeApi({ 'DELETE /api/things/1': { status: 204 } });
    await expect(apiRequest('DELETE', '/things/1', { token: 'abc' })).resolves.toBeUndefined();
  });

  it('turns an error response into ApiError with the NestJS message', async () => {
    fakeApi({
      'POST /api/a': { status: 409, body: { statusCode: 409, message: 'Already exists', error: 'Conflict' } },
      'POST /api/b': { status: 400, body: { statusCode: 400, message: ['email is required', 'name is required'] } },
      'POST /api/c': { status: 502 }
    });
    await expect(apiRequest('POST', '/a')).rejects.toMatchObject({ status: 409, message: 'Already exists' });
    await expect(apiRequest('POST', '/b')).rejects.toMatchObject({ message: 'email is required, name is required' });
    await expect(apiRequest('POST', '/c')).rejects.toMatchObject({ status: 502, message: 'Request failed with status 502' });
  });

  it('reports a server that cannot be reached as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = await apiRequest('GET', '/things').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, message: 'Cannot reach the server. Check your connection and try again.' });
  });

  it('tells the listener about a 401 only when the request carried a token', async () => {
    const listener = vi.fn();
    stop = onUnauthorized(listener);
    fakeApi({ 'GET /api/auth/me': { status: 401, body: { message: 'Unauthorized' } } });
    await expect(apiRequest('GET', '/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(listener).not.toHaveBeenCalled();
    await expect(apiRequest('GET', '/auth/me', { token: 'old' })).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
