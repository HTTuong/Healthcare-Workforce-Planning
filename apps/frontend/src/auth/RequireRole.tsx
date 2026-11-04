import { Outlet } from 'react-router';
import { useAuth } from './auth-context';
import type { Role } from './types';

/** Shows the page only to the given roles. Others see a plain message instead of a broken page full of 403s. */
export function RequireRole({ roles }: { roles: readonly Role[] }) {
  const { state } = useAuth();
  if (state.status !== 'signed-in') return null;
  if (!roles.includes(state.user.role)) {
    return (
      <section className="content">
        <h1>No access</h1>
        <p>Your role cannot open this page.</p>
      </section>
    );
  }
  return <Outlet />;
}
