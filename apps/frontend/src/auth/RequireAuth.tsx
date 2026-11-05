import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './auth-context';

/** Shows the page only to a signed in user. Anyone else goes to the login page, which sends them back afterwards. */
export function RequireAuth() {
  const { state, retry, logout } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') {
    return (
      <p className="page-status" role="status">
        Loading…
      </p>
    );
  }
  // The search part is kept too, so /shifts?week=2026-10-19 comes back with its week after login (U-03).
  if (state.status === 'unavailable') {
    return (
      <main className="login">
        <section className="login-card" aria-labelledby="unavailable-title">
          <p className="brand">Healthcare Workforce Planning</p>
          <h1 id="unavailable-title">Cannot reach the server</h1>
          <p>You are still signed in, but the planning service did not answer. Try again in a moment.</p>
          <div className="actions">
            <button type="button" className="primary" onClick={retry}>
              Try again
            </button>
            <button type="button" className="secondary" onClick={logout}>
              Sign out
            </button>
          </div>
        </section>
      </main>
    );
  }
  if (state.status === 'signed-out') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
