import { createContext, useContext } from 'react';
import type { RequestOptions } from '../api/client';
import type { Profile } from './types';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out'; notice?: 'expired' }
  | { status: 'signed-in'; user: Profile; roleChanged?: boolean };

export interface AuthContextValue {
  state: AuthState;
  login(email: string, password: string): Promise<void>;
  logout(): void;
  /** An API request that carries the signed in user's token. */
  request<T>(method: string, path: string, body?: RequestOptions['body']): Promise<T>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
