import { Outlet } from 'react-router';
import type { PermissionName } from './permissions';
import { useCan } from './useCan';

/** Shows the page only with the permission. Others see a plain message instead of a broken page full of 403s. */
export function RequirePermission({ permission }: { permission: PermissionName }) {
  const allowed = useCan(permission);
  if (!allowed) {
    return (
      <section>
        <h1>No access</h1>
        <p>Your role cannot open this page.</p>
      </section>
    );
  }
  return <Outlet />;
}
