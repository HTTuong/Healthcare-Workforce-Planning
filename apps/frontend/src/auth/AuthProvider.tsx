import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, onUnauthorized } from '../api/client';
import { AuthContext, type AuthContextValue, type AuthState } from './auth-context';
import { clearToken, getToken, setToken } from './session';
import type { Profile } from './types';

/**
 * Holds who is signed in. On start it restores the session from a stored token by asking GET /auth/me, so a reload
 * keeps the user signed in and a token that expired or belongs to a deactivated account is dropped at once.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => (getToken() ? { status: 'loading' } : { status: 'signed-out' }));

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
        // the server being down, shows the login page and keeps the token, so a reload can try again.
        if (active) setState((current) => (current.status === 'loading' ? { status: 'signed-out' } : current));
      });
    return () => {
      active = false;
    };
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

  const value = useMemo<AuthContextValue>(() => ({ state, login, logout, request }), [state, login, logout, request]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
