import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/auth-context';
import { canViewEmployees } from '../auth/roles';
import { ROLE_LABELS } from '../auth/types';

/** The frame of every signed in page: the top bar with navigation and the account, then the page. */
export function AppLayout() {
  const { state, logout } = useAuth();
  if (state.status !== 'signed-in') return null;
  const { user } = state;
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-start">
          <span className="brand">Healthcare Workforce Planning</span>
          <nav aria-label="Main">
            <NavLink to="/" end>
              Home
            </NavLink>
            {canViewEmployees(user.role) && <NavLink to="/employees">Employees</NavLink>}
          </nav>
        </div>
        <div className="account">
          <span>
            {user.firstName} {user.lastName}
          </span>
          <span className="role-badge">{ROLE_LABELS[user.role]}</span>
          <button type="button" className="secondary" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
