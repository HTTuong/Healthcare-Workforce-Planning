import { useEffect, useState } from 'react';
import { useAuth } from '../auth/auth-context';
import { ROLE_LABELS } from '../auth/types';

/** The first page after login: who is signed in, with the department name read from the API. */
export function HomePage() {
  const { state, request } = useAuth();
  const user = state.status === 'signed-in' ? state.user : null;
  const departmentId = user?.departmentId ?? null;
  const [department, setDepartment] = useState<string | null>(null);

  useEffect(() => {
    if (departmentId === null) return;
    let active = true;
    request<{ name: string }>('GET', `/departments/${departmentId}`)
      .then((found) => {
        if (active) setDepartment(found.name);
      })
      .catch(() => {
        // The name is a nicety. The page works without it.
      });
    return () => {
      active = false;
    };
  }, [departmentId, request]);

  if (!user) return null;
  return (
    <>
      <h1>Welcome, {user.firstName}</h1>
      <dl className="profile">
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Role</dt>
        <dd>{ROLE_LABELS[user.role]}</dd>
        <dt>Department</dt>
        <dd>{departmentId === null ? 'No department' : (department ?? '…')}</dd>
      </dl>
    </>
  );
}
