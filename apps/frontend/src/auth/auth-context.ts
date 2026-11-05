import { createContext, useContext } from 'react';
import type { RequestOptions } from '../api/client';
import type { Profile } from './types';

export type AuthState =
  | { status: 'loading' }
  /** A token is stored but the API did not answer, so it is not known whether it is still valid (U-05). */
  | { status: 'unavailable' }
  | { status: 'signed-out'; notice?: 'expired' }
  | { status: 'signed-in'; user: Profile; roleChanged?: boolean };

export interface AuthContextValue {
  state: AuthState;
  login(email: string, password: string): Promise<void>;
  logout(): void;
  /** Asks the API again for the stored token's user, after 'unavailable'. */
  retry(): void;
  /** An API request that carries the signed in user's token. */
  request<T>(method: string, path: string, body?: RequestOptions['body']): Promise<T>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
