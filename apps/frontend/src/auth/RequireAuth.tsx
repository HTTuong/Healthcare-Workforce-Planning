import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './auth-context';

/** Shows the page only to a signed in user. Anyone else goes to the login page, which sends them back afterwards. */
export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') {
    return (
      <p className="page-status" role="status">
        Loading…
      </p>
    );
  }
  if (state.status === 'signed-out') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
