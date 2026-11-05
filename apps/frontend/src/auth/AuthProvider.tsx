import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, onForbidden, onUnauthorized } from '../api/client';
import { AuthContext, type AuthContextValue, type AuthState } from './auth-context';
import { clearToken, getToken, setToken } from './session';
import type { Profile } from './types';

/**
 * Holds who is signed in. On start it restores the session from a stored token by asking GET /auth/me, so a reload
 * keeps the user signed in and a token that expired or belongs to a deactivated account is dropped at once.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => (getToken() ? { status: 'loading' } : { status: 'signed-out' }));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let active = true;
    apiRequest<Profile>('GET', '/auth/me', { token })
      .then((user) => {
        if (active) setState({ status: 'signed-in', user });
      })
      .catch(() => {
        // A 401 has already ended the session through onUnauthorized, with the notice. Any other failure, such as
        // the server being down, keeps the token and says the server is unavailable. Showing the login page here
        // looked like being signed out (U-05).
        if (active) setState((current) => (current.status === 'loading' ? { status: 'unavailable' } : current));
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  // Any later 401 on a request with a token ends the session and tells the login page why.
  useEffect(
    () =>
      onUnauthorized(() => {
        clearToken();
        setState({ status: 'signed-out', notice: 'expired' });
      }),
    []
  );

  // A 403 may mean an admin changed this user's role meanwhile. Reading the profile again makes the UI show what
  // the new role can do, instead of buttons the API now refuses.
  useEffect(
    () =>
      onForbidden(() => {
        const token = getToken();
        if (!token) return;
        apiRequest<Profile>('GET', '/auth/me', { token })
          .then((user) =>
            setState((current) =>
              current.status === 'signed-in' && current.user.role !== user.role ? { status: 'signed-in', user, roleChanged: true } : current
            )
          )
          .catch(() => {
            // A 401 here ends the session through onUnauthorized. Anything else keeps the current state.
          });
      }),
    []
  );

  const login = useCallback(async (email: string, password: string) => {
    const { accessToken } = await apiRequest<{ accessToken: string }>('POST', '/auth/login', { body: { email, password } });
    const user = await apiRequest<Profile>('GET', '/auth/me', { token: accessToken });
    setToken(accessToken);
    setState({ status: 'signed-in', user });
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setState({ status: 'signed-out' });
  }, []);

  const request = useCallback(
    <T,>(method: string, path: string, body?: unknown) => apiRequest<T>(method, path, { body, token: getToken() }),
    []
  );

  const value = useMemo<AuthContextValue>(() => ({ state, login, logout, retry, request }), [state, login, logout, retry, request]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
